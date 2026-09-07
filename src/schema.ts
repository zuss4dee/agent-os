import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ErrorObject, ValidateFunction } from "ajv";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js") as new (opts?: object) => {
  compile: (schema: object) => ValidateFunction;
  getSchema: (id: string) => ValidateFunction | undefined;
};
const addFormats = require("ajv-formats") as (ajv: unknown) => void;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const cache = new Map<string, ValidateFunction>();

export function validateAgainstSchema(
  repoRoot: string,
  schemaFile: string,
  data: unknown,
): string[] {
  const validator = getValidator(join(repoRoot, "schemas", schemaFile));
  const ok = validator(data);
  if (ok) return [];
  return (validator.errors ?? []).map(formatError);
}

function getValidator(schemaPath: string): ValidateFunction {
  const existing = cache.get(schemaPath);
  if (existing) return existing;
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $id?: string };
  const cacheKey = schema.$id ?? schemaPath;
  const byId = cache.get(cacheKey) ?? (schema.$id ? ajv.getSchema(schema.$id) : undefined);
  if (byId) {
    cache.set(schemaPath, byId);
    cache.set(cacheKey, byId);
    return byId;
  }
  const validator = ajv.compile(schema);
  cache.set(schemaPath, validator);
  cache.set(cacheKey, validator);
  return validator;
}

function formatError(error: ErrorObject): string {
  const path = error.instancePath || "/";
  return `${path} ${error.message ?? "invalid"}`.trim();
}
