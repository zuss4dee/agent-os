import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadYamlFile } from "./yaml.ts";
import { validateAgainstSchema } from "./schema.ts";
import { validateChangelog, loadEvalSuite } from "./changelog.ts";
import { scanPathForSecrets } from "./secrets.ts";
import { DEFAULT_SHARED_POLICIES, fileExists } from "./paths.ts";
import { assertKnownTool, findAgentRecord, findSkill, validateCatalog } from "./registry.ts";
import { formatSkillPin, parseSkillPin, type SkillPin } from "./semver.ts";
import type { AgentManifest } from "./types.ts";
import {
  isCatalogExemptAgentDir,
  isProductionAgent,
  productionAgentMayPin,
  REQUIRED_PRODUCTION_POLICIES,
} from "./lifecycle.ts";
import { skillArtifactHash, skillMatchesExpectedHash } from "./artifact.ts";

export type AgentValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest?: AgentManifest;
};

export function validateAgentDir(repoRoot: string, agentDirectory: string): AgentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifestPath = join(agentDirectory, "manifest.yaml");

  const requiredFiles = ["manifest.yaml", "profile.md", "system.md", "operating-manual.md", "changelog.md"];
  for (const file of requiredFiles) {
    if (!existsSync(join(agentDirectory, file))) errors.push(`missing required file: ${file}`);
  }
  if (errors.length) return { ok: false, errors, warnings };

  errors.push(...validateCatalog(repoRoot));

  let manifest: AgentManifest;
  try {
    manifest = loadYamlFile<AgentManifest>(manifestPath);
  } catch (err) {
    return {
      ok: false,
      errors: [`invalid YAML in manifest.yaml: ${err instanceof Error ? err.message : String(err)}`],
      warnings,
    };
  }

  errors.push(...validateAgainstSchema(repoRoot, "agent-manifest.schema.json", manifest));

  const dirId = agentDirectory.split(/[/\\]/).filter(Boolean).at(-1);
  if (manifest.id && dirId && dirId !== manifest.id && !dirId.startsWith("_")) {
    errors.push(`directory name "${dirId}" does not match manifest.id "${manifest.id}"`);
  }

  if (!isCatalogExemptAgentDir(agentDirectory)) {
    const registered = findAgentRecord(repoRoot, manifest.id);
    if (registered.error) errors.push(registered.error);
  }

  const promptFiles = manifest.prompt ?? {
    profile: "profile.md",
    system: "system.md",
    operating_manual: "operating-manual.md",
  };
  for (const [key, rel] of Object.entries(promptFiles)) {
    const full = join(agentDirectory, rel);
    if (!fileExists(full)) errors.push(`prompt.${key} not found: ${rel}`);
  }

  const pins = parsePins(manifest.skills ?? [], errors, "manifest.yaml");
  const seenPins = new Set<string>();
  const seenIds = new Map<string, string>();
  const production = isProductionAgent(manifest.metadata?.status);

  for (const pin of pins) {
    const key = formatSkillPin(pin);
    if (seenPins.has(key)) errors.push(`duplicate skill pin ${key}`);
    seenPins.add(key);
    const prior = seenIds.get(pin.id);
    if (prior && prior !== pin.version) {
      errors.push(`conflicting versions for skill ${pin.id}: ${prior} and ${pin.version}`);
    }
    seenIds.set(pin.id, pin.version);
    const found = findSkill(repoRoot, pin.id, pin.version);
    if (found.error) {
      errors.push(found.error);
      continue;
    }
    const record = found.record!;
    if (production && !productionAgentMayPin(record.lifecycle)) {
      errors.push(
        `production agent cannot pin skill ${key} with lifecycle "${record.lifecycle}" (allowed: production)`,
      );
    }
    if (production && record.lifecycle === "deprecated") {
      errors.push(`production agent cannot pin deprecated skill ${key}`);
    }
    for (const tool of record.manifest.requirements.tools ?? []) {
      const toolErr = assertKnownTool(repoRoot, tool);
      if (toolErr) errors.push(`skill ${key}: ${toolErr}`);
    }
    if (record.artifact_hash && !skillMatchesExpectedHash(record.path, record.manifest, record.artifact_hash)) {
      errors.push(
        `skill ${key}: disk artifact hash does not match published registry artifact_hash`,
      );
    }
    if (
      (record.lifecycle === "production" || record.lifecycle === "deprecated") &&
      record.artifact_hash &&
      skillArtifactHash(record.path, record.manifest) !== record.artifact_hash
    ) {
      errors.push(`skill ${key}: released pin is stale; bump version instead of editing ${record.lifecycle} files`);
    }
  }

  for (const tool of manifest.tools ?? []) {
    const toolErr = assertKnownTool(repoRoot, tool);
    if (toolErr) errors.push(toolErr);
  }

  for (const rel of manifest.knowledge ?? []) {
    const full = resolve(agentDirectory, rel);
    if (!existsSync(full)) errors.push(`broken knowledge reference: ${rel}`);
  }

  const examplesGood = join(agentDirectory, "examples", "good");
  const examplesBad = join(agentDirectory, "examples", "bad");
  if (!existsSync(examplesGood) || !existsSync(examplesBad)) {
    errors.push("missing examples/good and/or examples/bad");
  }

  if (production) {
    if (Array.isArray(manifest.shared_policies) && manifest.shared_policies.length === 0) {
      errors.push("production agent cannot compile with empty shared_policies");
    }
    const policies = manifest.shared_policies ?? DEFAULT_SHARED_POLICIES;
    for (const required of REQUIRED_PRODUCTION_POLICIES) {
      if (!policies.includes(required)) {
        errors.push(`production agent missing required shared policy ${required}`);
      }
    }
  }

  const policies = manifest.shared_policies ?? DEFAULT_SHARED_POLICIES;
  for (const policy of policies) {
    const full = join(repoRoot, "shared", policy);
    if (!existsSync(full)) errors.push(`missing shared policy: shared/${policy}`);
  }

  errors.push(...validateChangelog(join(agentDirectory, "changelog.md")));

  const evalDir = join(agentDirectory, manifest.evaluation?.suite ?? "evals");
  const evalResult = loadEvalSuite(repoRoot, evalDir);
  errors.push(...evalResult.errors);

  if (manifest.metadata?.status === "production" && evalResult.cases.length === 0) {
    errors.push("production agent has empty evaluation suite");
  }

  errors.push(...scanPathForSecrets(agentDirectory));

  const refs = join(agentDirectory, "references");
  const knowledge = join(agentDirectory, "knowledge");
  if (!existsSync(refs) || !statSync(refs).isDirectory()) errors.push("missing references/ directory");
  if (!existsSync(knowledge) || !statSync(knowledge).isDirectory()) errors.push("missing knowledge/ directory");

  return { ok: errors.length === 0, errors, warnings, manifest };
}

function parsePins(values: Array<string | SkillPin>, errors: string[], source: string): SkillPin[] {
  const pins: SkillPin[] = [];
  for (const value of values) {
    try {
      pins.push(parseSkillPin(value));
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return pins;
}

export function listAgentIds(repoRoot: string): string[] {
  const dir = join(repoRoot, "agents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    if (name.startsWith("_")) return false;
    return existsSync(join(dir, name, "manifest.yaml"));
  });
}
