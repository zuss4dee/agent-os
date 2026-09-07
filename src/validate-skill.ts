import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { loadYamlFile } from "./yaml.ts";
import { validateAgainstSchema } from "./schema.ts";
import { validateChangelog, loadEvalSuite } from "./changelog.ts";
import { scanPathForSecrets } from "./secrets.ts";
import { readText } from "./paths.ts";
import type { SkillManifest } from "./types.ts";
import { isSemver } from "./semver.ts";
import { skillArtifactHash } from "./artifact.ts";
import { isCatalogExemptSkillDir, lifecycleBucketError } from "./lifecycle.ts";
import { findSkill } from "./registry.ts";

const CODE_EXTENSIONS = new Set([
  ".py",
  ".sh",
  ".bash",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".go",
  ".rb",
  ".ps1",
  ".wasm",
  ".exe",
]);

const NETWORK_HINTS =
  /\b(https?:\/\/|curl |wget |fetch\(|axios|openai|xai|web_search|WebFetch)\b/i;
const EXEC_HINTS = /\b(exec\(|spawn\(|child_process|subprocess|os\.system|bash -c)\b/i;
const FS_HINTS = /\b(readFile|writeFile|unlink|rm -rf|fs\.(read|write)|open\()\b/;

export type SkillValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest?: SkillManifest;
  contentSha256?: string;
};

export function validateSkillDir(repoRoot: string, skillDir: string): SkillValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifestPath = join(skillDir, "manifest.yaml");
  const skillMd = join(skillDir, "SKILL.md");

  if (!existsSync(manifestPath)) errors.push("missing manifest.yaml");
  if (!existsSync(skillMd)) errors.push("missing SKILL.md");
  if (errors.length) return { ok: false, errors, warnings };

  let manifest: SkillManifest;
  try {
    manifest = loadYamlFile<SkillManifest>(manifestPath);
  } catch (err) {
    return {
      ok: false,
      errors: [`invalid YAML in manifest.yaml: ${err instanceof Error ? err.message : String(err)}`],
      warnings,
    };
  }

  errors.push(...validateAgainstSchema(repoRoot, "skill-manifest.schema.json", manifest));
  if (!isSemver(manifest.version ?? "")) {
    errors.push(`malformed version: ${String(manifest.version)}`);
  }

  const entry = join(skillDir, manifest.runtime?.entrypoint ?? "SKILL.md");
  if (manifest.runtime && !existsSync(entry)) {
    errors.push(`runtime entrypoint not found: ${manifest.runtime.entrypoint}`);
  }

  errors.push(...validateChangelog(join(skillDir, "changelog.md")));

  const evalDir = join(skillDir, manifest.evaluation?.suite ?? "evals");
  const evalResult = loadEvalSuite(repoRoot, evalDir);
  errors.push(...evalResult.errors);

  const dirName = skillDir.split(/[/\\]/).at(-1) ?? "";
  const parentName = skillDir.split(/[/\\]/).at(-2) ?? "";
  if (dirName !== manifest.version && dirName !== manifest.id && parentName !== manifest.id) {
    warnings.push(
      `directory layout should be skills/<lifecycle>/${manifest.id}/${manifest.version}/ (found ${skillDir})`,
    );
  }

  const bucketErr = lifecycleBucketError(skillDir, manifest.status.lifecycle);
  if (bucketErr) errors.push(bucketErr);

  if (!isCatalogExemptSkillDir(skillDir)) {
    const registered = findSkill(repoRoot, manifest.id, manifest.version);
    if (registered.error) {
      errors.push(registered.error);
    } else if (registered.record) {
      const published = registered.record.artifact_hash;
      if (published) {
        const current = skillArtifactHash(skillDir, manifest);
        if (current !== published) {
          errors.push(
            `${manifest.id}@${manifest.version}: disk artifact hash does not match published registry hash; bump the version instead of mutating this pin`,
          );
        }
      } else if (manifest.status.lifecycle === "production" || manifest.status.lifecycle === "deprecated") {
        errors.push(
          `${manifest.id}@${manifest.version}: missing registry artifact_hash for a ${manifest.status.lifecycle} skill`,
        );
      }
    }
  }

  const codeFiles = listCodeFiles(skillDir);
  const instructionOnly = manifest.runtime?.type === "instruction";

  if (codeFiles.length && instructionOnly) {
    errors.push(
      `undeclared executable behavior: found code files (${codeFiles.join(", ")}) but runtime.type is "instruction"`,
    );
  }
  if (codeFiles.length && manifest.permissions && !manifest.permissions.execution) {
    errors.push(
      `undeclared execution permission: code files present (${codeFiles.join(", ")}) but permissions.execution is false`,
    );
  }

  const skillBody = existsSync(skillMd) ? readText(skillMd) : "";
  if (NETWORK_HINTS.test(skillBody) && manifest.permissions && !manifest.permissions.network) {
    errors.push("undeclared network requirement: SKILL.md references network/HTTP but permissions.network is false");
  }
  if (EXEC_HINTS.test(skillBody) && manifest.permissions && !manifest.permissions.execution) {
    errors.push("undeclared execution requirement: SKILL.md references process execution but permissions.execution is false");
  }
  if (FS_HINTS.test(skillBody) && manifest.permissions && !manifest.permissions.filesystem) {
    errors.push("undeclared filesystem requirement: SKILL.md references filesystem APIs but permissions.filesystem is false");
  }

  if (manifest.origin?.type === "third-party") {
    if (!manifest.origin.source_url) errors.push("imported skill missing origin.source_url");
    if (!manifest.origin.author) errors.push("imported skill missing origin.author");
    if (!manifest.origin.imported_at) errors.push("imported skill missing origin.imported_at");
    if (!manifest.status?.reviewer && manifest.status?.review_status !== "unreviewed") {
      errors.push("imported skill must record reviewer or set review_status: unreviewed");
    }
    if (manifest.status?.trusted === true && manifest.status.review_status !== "approved") {
      errors.push("third-party skill cannot be trusted until review_status is approved");
    }
    if (manifest.status?.lifecycle === "production" && manifest.status.review_status !== "approved") {
      errors.push("third-party skill cannot be production without approved review");
    }
  }

  if (manifest.status?.lifecycle === "production") {
    if (manifest.evaluation?.score == null) {
      errors.push("production skill missing evaluation.score");
    }
    if (!manifest.evaluation?.last_evaluated_at) {
      errors.push("production skill missing evaluation.last_evaluated_at");
    }
  }

  if ((manifest.requirements?.credentials ?? []).length > 0) {
    warnings.push(
      "skill declares credential names; values must never be stored in Agent OS",
    );
  }

  errors.push(...scanPathForSecrets(skillDir));

  const references = join(skillDir, "references");
  if (!existsSync(references) || !statSync(references).isDirectory()) {
    errors.push("missing references/ directory");
  }

  const ok = errors.length === 0;
  let contentSha256: string | undefined;
  try {
    contentSha256 = skillArtifactHash(skillDir, manifest);
  } catch {
    contentSha256 = undefined;
  }
  return { ok, errors, warnings, manifest, contentSha256 };
}

function listCodeFiles(dir: string, acc: string[] = [], root = dir): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "evals" || entry === "examples") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) listCodeFiles(full, acc, root);
    else if (CODE_EXTENSIONS.has(extname(entry)) && entry !== "SKILL.md") {
      acc.push(relative(root, full));
    }
  }
  return acc;
}
