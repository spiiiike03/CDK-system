import { NextRequest } from "next/server";
import { downloadName, normalizeCdk } from "@/lib/cdk";
import { ensureSchema, sql } from "@/lib/db";
import { buildJsonlTextExport, textExportName } from "@/lib/export";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryFile = {
  id: string;
  name: string;
  content: unknown;
};

type QuerySuccess = {
  ok: true;
  code: string;
  filename: string;
  deliveredCount: number;
  files: QueryFile[];
  payload: unknown;
};

type QueryFailure = {
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

    const results: Array<QuerySuccess | QueryFailure> = [];
    for (const code of codes) {
      results.push(await queryOne(code));
    }

    const successes = results.filter((item): item is QuerySuccess => item.ok);
    const failures = results.filter((item): item is QueryFailure => !item.ok);
    const deliveredCount = successes.reduce((sum, item) => sum + item.deliveredCount, 0);
    const exportedAt = new Date().toISOString();
    const filename = successes.length === 1
      ? successes[0].filename
      : `cdk-query-${exportedAt.replace(/[:.]/g, "-")}.txt`;
    const payload = successes.length === 1
      ? successes[0].payload
      : buildJsonlTextExport(successes.flatMap((item) => item.files));

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
    return `查询完成：成功 ${successCount} 个，失败 ${failCount} 个，查到 ${deliveredCount} 个 JSON`;
  }
  if (successCount) {
    return `查询成功：查到 ${deliveredCount} 个 JSON`;
  }
  return "查询失败";
}

async function queryOne(code: string): Promise<QuerySuccess | QueryFailure> {
  const cdkRows = await sql`
    select id, code, used_count
    from cdk_codes
    where upper(code) = upper(${code})
    limit 1
  `;

  if (!cdkRows.length) {
    return { ok: false, code, message: "CDK 不存在" };
  }

  const cdk = cdkRows[0];
  if (Number(cdk.used_count) <= 0) {
    return { ok: false, code: cdk.code, message: "CDK 尚未兑换" };
  }

  const fileRows = await sql`
    select coalesce(
      json_agg(
        json_build_object(
          'id', json_files.id,
          'name', json_files.original_name,
          'content', json_files.content
        )
        order by redeem_records.created_at asc, picked.ordinality asc
      ),
      '[]'::json
    ) as files
    from redeem_records
    join unnest(redeem_records.file_ids) with ordinality as picked(file_id, ordinality) on true
    join json_files on json_files.id = picked.file_id
    where redeem_records.cdk_id = ${cdk.id}
  `;

  const files = (fileRows[0]?.files || []) as QueryFile[];
  if (!files.length) {
    return { ok: false, code: cdk.code, message: "未找到该 CDK 的发放文件" };
  }

  const payload = files.length === 1
    ? files[0].content
    : buildJsonlTextExport(files);
  const filename = files.length === 1
    ? downloadName(cdk.code, files.length)
    : textExportName(downloadName(cdk.code, files.length));

  return {
    ok: true,
    code: cdk.code,
    filename,
    deliveredCount: files.length,
    files,
    payload,
  };
}
