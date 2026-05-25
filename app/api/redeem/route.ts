import { NextRequest } from "next/server";
import { downloadName, normalizeCdk } from "@/lib/cdk";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, clientIp, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RedeemFile = {
  id: string;
  name: string;
  content: unknown;
};

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const code = normalizeCdk(body.cdk);
    if (!code) {
      return badRequest("请输入 CDK");
    }

    const rows = await sql`
      with selected_cdk as (
        select *
        from cdk_codes
        where upper(code) = upper(${code})
          and status = 'active'
          and used_count < max_uses
          and (expires_at is null or expires_at > now())
        for update
      ),
      selected_files as (
        select id
        from json_files
        where status = 'available'
        order by imported_at asc
        limit (select file_count from selected_cdk)
        for update skip locked
      ),
      file_check as (
        select count(*)::int as count from selected_files
      ),
      eligible_cdk as (
        select selected_cdk.*
        from selected_cdk, file_check
        where file_check.count >= selected_cdk.file_count
      ),
      updated_files as (
        update json_files
        set status = 'delivered',
            delivered_at = now(),
            delivered_cdk_id = (select id from eligible_cdk)
        where id in (select id from selected_files)
          and exists (select 1 from eligible_cdk)
        returning id, original_name, content
      ),
      updated_cdk as (
        update cdk_codes
        set used_count = used_count + 1,
            status = case when used_count + 1 >= max_uses then 'used' else status end,
            used_at = case when used_count + 1 >= max_uses then now() else used_at end
        where id = (select id from eligible_cdk)
        returning id, code
      ),
      record as (
        insert into redeem_records (cdk_id, cdk_code, file_ids, delivered_count, ip)
        select updated_cdk.id,
               updated_cdk.code,
               array_agg(updated_files.id),
               count(updated_files.id)::int,
               ${clientIp(request)}
        from updated_cdk, updated_files
        group by updated_cdk.id, updated_cdk.code
        returning id, cdk_id, delivered_count
      )
      select updated_cdk.code,
             record.id as record_id,
             record.delivered_count,
             coalesce(
               json_agg(
                 json_build_object(
                   'id', updated_files.id,
                   'name', updated_files.original_name,
                   'content', updated_files.content
                 )
               ),
               '[]'::json
             ) as files
      from updated_cdk
      join record on record.cdk_id = updated_cdk.id
      join updated_files on true
      group by updated_cdk.code, record.id, record.delivered_count
    `;

    if (!rows.length) {
      return await redeemFailure(code);
    }

    const files = rows[0].files as RedeemFile[];
    const payload = files.length === 1
      ? files[0].content
      : files.map((file) => ({ name: file.name, content: file.content }));

    return json({
      ok: true,
      message: "兑换成功",
      filename: downloadName(rows[0].code, files.length),
      deliveredCount: files.length,
      files: files.map((file) => ({ id: file.id, name: file.name })),
      payload,
    });
  } catch (error) {
    return serverError(error);
  }
}

async function redeemFailure(code: string) {
  const rows = await sql`
    select status, file_count, used_count, max_uses, expires_at
    from cdk_codes
    where upper(code) = upper(${code})
    limit 1
  `;
  if (!rows.length) {
    return badRequest("CDK 不存在");
  }
  const cdk = rows[0];
  if (cdk.status === "disabled") {
    return badRequest("CDK 已禁用");
  }
  if (cdk.status === "used" || Number(cdk.used_count) >= Number(cdk.max_uses)) {
    return badRequest("CDK 已使用");
  }
  if (cdk.expires_at && new Date(cdk.expires_at).getTime() <= Date.now()) {
    return badRequest("CDK 已过期");
  }
  return badRequest("库存不足，请联系售后");
}
