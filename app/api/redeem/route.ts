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

type RedeemSuccess = {
  ok: true;
  code: string;
  filename: string;
  deliveredCount: number;
  files: RedeemFile[];
  payload: unknown;
};

type RedeemFailure = {
  ok: false;
  code: string;
  message: string;
};

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const codes = parseCodes(body);

    if (!codes.length) {
      return badRequest("请输入 CDK");
    }

    const ip = clientIp(request);
    const results: Array<RedeemSuccess | RedeemFailure> = [];

    for (const code of codes) {
      results.push(await redeemOne(code, ip));
    }

    const successes = results.filter((item): item is RedeemSuccess => item.ok);
    const failures = results.filter((item): item is RedeemFailure => !item.ok);
    const deliveredCount = successes.reduce((sum, item) => sum + item.deliveredCount, 0);
    const exportedAt = new Date().toISOString();
    const filename = successes.length === 1
      ? successes[0].filename
      : `cdk-batch-${exportedAt.replace(/[:.]/g, "-")}.json`;
    const payload = successes.length === 1
      ? successes[0].payload
      : {
          exportedAt,
          totalCdks: successes.length,
          totalFiles: deliveredCount,
          items: successes.map((item) => ({
            cdk: item.code,
            files: item.files.map((file) => ({
              name: file.name,
              content: file.content,
            })),
          })),
          errors: failures.map((item) => ({
            cdk: item.code,
            message: item.message,
          })),
        };

    return json({
      ok: successes.length > 0,
      message: buildMessage(successes.length, failures.length, deliveredCount),
      filename,
      deliveredCount,
      successCount: successes.length,
      failCount: failures.length,
      results,
      payload,
    }, { status: successes.length > 0 ? 200 : 400 });
  } catch (error) {
    return serverError(error);
  }
}

function parseCodes(body: Record<string, unknown>) {
  const raw = Array.isArray(body.cdks)
    ? body.cdks
    : String(body.cdk ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim());

  return raw
    .map((value) => normalizeCdk(value))
    .filter(Boolean);
}

function buildMessage(successCount: number, failCount: number, deliveredCount: number) {
  if (successCount && failCount) {
    return `兑换完成：成功 ${successCount} 个，失败 ${failCount} 个，发放 ${deliveredCount} 个 JSON`;
  }
  if (successCount) {
    return `兑换成功：发放 ${deliveredCount} 个 JSON`;
  }
  return "兑换失败";
}

async function redeemOne(code: string, ip: string): Promise<RedeemSuccess | RedeemFailure> {
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
             ${ip}
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
    return { ok: false, code, message: await redeemFailureMessage(code) };
  }

  const files = rows[0].files as RedeemFile[];
  const payload = files.length === 1
    ? files[0].content
    : files.map((file) => ({ name: file.name, content: file.content }));

  return {
    ok: true,
    code: rows[0].code,
    filename: downloadName(rows[0].code, files.length),
    deliveredCount: files.length,
    files,
    payload,
  };
}

async function redeemFailureMessage(code: string) {
  const rows = await sql`
    select status, file_count, used_count, max_uses, expires_at
    from cdk_codes
    where upper(code) = upper(${code})
    limit 1
  `;
  if (!rows.length) {
    return "CDK 不存在";
  }
  const cdk = rows[0];
  if (cdk.status === "disabled") {
    return "CDK 已禁用";
  }
  if (cdk.status === "used" || Number(cdk.used_count) >= Number(cdk.max_uses)) {
    return "CDK 已使用";
  }
  if (cdk.expires_at && new Date(cdk.expires_at).getTime() <= Date.now()) {
    return "CDK 已过期";
  }
  return "库存不足，请联系售后";
}
