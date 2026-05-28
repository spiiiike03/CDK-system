import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCdk(prefix = "CDK") {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `${normalizePrefix(prefix)}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizePrefix(value: unknown) {
  const text = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return text || "CDK";
}

export function normalizeCdk(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function cdkPrefixFromCode(code: unknown) {
  return normalizePrefix(normalizeCdk(code).split("-")[0]);
}

export function downloadName(code: string, count: number) {
  const safeCode = normalizeCdk(code).replace(/[^A-Z0-9-]+/g, "_");
  return count > 1 ? `${safeCode}-bundle.json` : `${safeCode}.json`;
}
