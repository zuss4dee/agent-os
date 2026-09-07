import { createHash } from "node:crypto";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashFileContents(contents: string, pathLabel: string): { path: string; sha256: string } {
  return { path: pathLabel, sha256: sha256(contents) };
}

/** Stable JSON for hashing: sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortValue(record[key]);
    }
    return out;
  }
  return value;
}

export function contentHash(value: unknown): string {
  return sha256(canonicalJson(value));
}
