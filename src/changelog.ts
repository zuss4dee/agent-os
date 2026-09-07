import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadYamlFile } from "./yaml.ts";
import type { EvalCase } from "./types.ts";
import { validateAgainstSchema } from "./schema.ts";

const MEANINGLESS = [
  /^updated prompt\.?$/i,
  /^typo\.?$/i,
  /^wip\.?$/i,
  /^fixes\.?$/i,
  /^update\.?$/i,
];

const REQUIRED_CHANGELOG_HEADINGS = [
  "## Unreleased",
];

export function validateChangelog(path: string): string[] {
  const errors: string[] = [];
  if (!existsSync(path)) {
    return [`missing changelog: ${path}`];
  }
  const text = readFileSync(path, "utf8");
  for (const heading of REQUIRED_CHANGELOG_HEADINGS) {
    if (!text.includes(heading)) {
      errors.push(`${path}: missing required heading "${heading}"`);
    }
  }
  const entries = [...text.matchAll(/^### .+$/gm)].map((m) => m[0].slice(4).trim());
  for (const entry of entries) {
    if (MEANINGLESS.some((re) => re.test(entry))) {
      errors.push(`${path}: meaningless changelog title "${entry}". Describe what/why/expected behavior/rollback.`);
    }
  }
  if (!/What changed|Why|Expected behavior|Evaluation impact|Rollback/i.test(text)) {
    errors.push(
      `${path}: changelog must explain what changed, why, expected behavior change, evaluation impact, and rollback path`,
    );
  }
  return errors;
}

export function loadEvalSuite(repoRoot: string, suiteDir: string): { cases: EvalCase[]; errors: string[] } {
  const errors: string[] = [];
  const cases: EvalCase[] = [];
  if (!existsSync(suiteDir)) {
    return { cases, errors: [`missing eval suite directory: ${suiteDir}`] };
  }
  const files = readdirSync(suiteDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  if (files.length === 0) {
    errors.push(`eval suite ${suiteDir} contains no YAML cases`);
  }
  for (const file of files) {
    const full = join(suiteDir, file);
    try {
      const data = loadYamlFile<EvalCase>(full);
      const schemaErrors = validateAgainstSchema(repoRoot, "eval-case.schema.json", data);
      if (schemaErrors.length) {
        errors.push(...schemaErrors.map((e) => `${file}: ${e}`));
      } else {
        cases.push(data);
      }
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { cases, errors };
}
