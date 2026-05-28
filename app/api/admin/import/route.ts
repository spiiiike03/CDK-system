import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { normalizePrefix } from "@/lib/cdk";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportItem = {
  name?: string;
  text?: unknown;
  content?: unknown;
};

type ParsedItem = {
  name: string;
  content: unknown;
};

class ImportParseError extends Error {}

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request);
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const cdkPrefix = normalizePrefix(body.cdkPrefix ?? body.prefix);
    const rawItems = Array.isArray(body.items) ? body.items as ImportItem[] : [];
    const items = rawItems.flatMap((item, index) => parseImportItem(item, index));
    if (!rawItems.length) {
      return badRequest("没有可导入的 JSON 文件");
    }
    if (!items.length) {
      return badRequest("没有解析到可导入的账号 JSON");
    }
    if (items.length > 500) {
      return badRequest(`单次最多导入 500 个账号 JSON，当前解析到 ${items.length} 个`);
    }

    let imported = 0;
    for (const item of items) {
      if (item.content === null || typeof item.content === "undefined") {
        continue;
      }
      await sql`
        insert into json_files (original_name, cdk_prefix, content)
        values (${item.name}, ${cdkPrefix}, ${JSON.stringify(item.content)}::jsonb)
      `;
      imported += 1;
    }

    return json({ ok: true, imported, cdkPrefix });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ImportParseError) return badRequest(error.message);
    return serverError(error);
  }
}

function parseImportItem(item: ImportItem, index: number): ParsedItem[] {
  const originalName = sanitizeFileName(String(item.name || `json-${Date.now()}-${index + 1}.json`));

  if (typeof item.text === "string") {
    return parseTextFile(item.text, originalName);
  }

  if (item.content === null || typeof item.content === "undefined") {
    return [];
  }

  return buildParsedItems(splitTopLevelPayload(item.content), originalName);
}

function parseTextFile(text: string, originalName: string): ParsedItem[] {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return [];

  const direct = tryParseJson(normalized);
  if (direct.ok) {
    return buildParsedItems(splitTopLevelPayload(direct.value), originalName);
  }

  const lineItems = parseJsonLines(normalized);
  if (lineItems.length) {
    return buildParsedItems(lineItems.flatMap(splitTopLevelPayload), originalName);
  }

  const extractedItems = extractJsonValues(normalized);
  if (extractedItems.length) {
    return buildParsedItems(extractedItems.flatMap(splitTopLevelPayload), originalName);
  }

  throw new ImportParseError(`${originalName} 不是有效 JSON/JSONL，未找到账号 JSON`);
}

function parseJsonLines(text: string) {
  const values: unknown[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!looksLikeJson(trimmed)) continue;

    const parsed = tryParseJson(trimmed);
    if (parsed.ok) {
      values.push(parsed.value);
    }
  }

  return values;
}

function extractJsonValues(text: string) {
  const values: unknown[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (!looksLikeJson(text[index])) continue;

    const end = findJsonValueEnd(text, index);
    if (end === -1) continue;

    const parsed = tryParseJson(text.slice(index, end + 1));
    if (parsed.ok) {
      values.push(parsed.value);
      index = end;
    }
  }

  return values;
}

function findJsonValueEnd(text: string, start: number) {
  const first = text[start];
  const stack = [first === "{" ? "}" : "]"];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      stack.push("}");
    } else if (char === "[") {
      stack.push("]");
    } else if (char === "}" || char === "]") {
      if (stack[stack.length - 1] !== char) return -1;
      stack.pop();
      if (!stack.length) return index;
    }
  }

  return -1;
}

function splitTopLevelPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (isRecord(value)) {
    for (const key of ["accounts", "items"]) {
      const nested = value[key];
      if (Array.isArray(nested)) return nested;
    }
  }

  return [value];
}

function buildParsedItems(contents: unknown[], originalName: string): ParsedItem[] {
  const filtered = contents.filter((content) => content !== null && typeof content !== "undefined");
  const total = filtered.length;

  return filtered.map((content, index) => ({
    name: buildSplitName(originalName, index, total),
    content,
  }));
}

function buildSplitName(originalName: string, index: number, total: number) {
  const base = stripKnownExtension(originalName) || "account";
  if (total <= 1) {
    return ensureJsonExtension(base).slice(0, 180);
  }

  const width = Math.max(3, String(total).length);
  const suffix = String(index + 1).padStart(width, "0");
  return `${base}-${suffix}.json`.slice(0, 180);
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "account.json";
}

function stripKnownExtension(value: string) {
  return value.replace(/\.(jsonl?|txt)$/i, "");
}

function ensureJsonExtension(value: string) {
  return /\.json$/i.test(value) ? value : `${value}.json`;
}

function looksLikeJson(value: string) {
  return value.startsWith("{") || value.startsWith("[");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
