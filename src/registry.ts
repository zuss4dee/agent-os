import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadYamlFile } from "./yaml.ts";
import { validateAgainstSchema } from "./schema.ts";
import { listSkillLocations } from "./paths.ts";
import type { AgentManifest, SkillLifecycle, SkillManifest } from "./types.ts";
import { skillArtifactHash } from "./artifact.ts";
import { isCatalogExemptAgentDir, isCatalogExemptSkillDir, lifecycleBucketError } from "./lifecycle.ts";

export type SkillRecord = {
  id: string;
  version: string;
  path: string;
  lifecycle: SkillLifecycle;
  artifact_hash: string | null;
  manifest: SkillManifest;
};

export type AgentRecord = {
  id: string;
  path: string;
  version: string;
  status: string;
};

export type RegistryFile = {
  schema_version: number;
  agents?: Array<{ id: string; path: string; version: string; status: string }>;
  skills?: Array<{
    id: string;
    version: string;
    path: string;
    lifecycle: string;
    artifact_hash?: string | null;
  }>;
  tools?: Array<{ id: string; name: string; description?: string; connector?: string }>;
  routines?: Array<{ id: string; path: string; version?: string }>;
};

export function loadRegistryFile(repoRoot: string, name: string): { data: RegistryFile; errors: string[] } {
  const path = join(repoRoot, "registry", name);
  if (!existsSync(path)) {
    return { data: { schema_version: 1 }, errors: [`missing registry file: registry/${name}`] };
  }
  const data = loadYamlFile<RegistryFile>(path);
  const errors = validateAgainstSchema(repoRoot, "registry.schema.json", data);
  return { data, errors: errors.map((e) => `registry/${name}: ${e}`) };
}

export function validateCatalog(repoRoot: string): string[] {
  const errors: string[] = [];
  const agentsReg = loadRegistryFile(repoRoot, "agents.yaml");
  const skillsReg = loadRegistryFile(repoRoot, "skills.yaml");
  const toolsReg = loadRegistryFile(repoRoot, "tools.yaml");
  errors.push(...agentsReg.errors, ...skillsReg.errors, ...toolsReg.errors);

  const registeredSkillKeys = new Set<string>();
  for (const entry of skillsReg.data.skills ?? []) {
    const key = `${entry.id}@${entry.version}`;
    if (registeredSkillKeys.has(key)) {
      errors.push(`registry/skills.yaml: duplicate ${key}`);
      continue;
    }
    registeredSkillKeys.add(key);
    const abs = resolve(repoRoot, entry.path);
    if (!existsSync(join(abs, "manifest.yaml"))) {
      errors.push(`registry/skills.yaml: ${key} path missing: ${entry.path}`);
      continue;
    }
    let manifest: SkillManifest;
    try {
      manifest = loadYamlFile<SkillManifest>(join(abs, "manifest.yaml"));
    } catch (err) {
      errors.push(`registry/skills.yaml: ${key} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (manifest.id !== entry.id || manifest.version !== entry.version) {
      errors.push(
        `registry/skills.yaml: ${key} does not match manifest ${manifest.id}@${manifest.version} at ${entry.path}`,
      );
    }
    if (manifest.status.lifecycle !== entry.lifecycle) {
      errors.push(
        `registry/skills.yaml: ${key} lifecycle "${entry.lifecycle}" does not match manifest "${manifest.status.lifecycle}"`,
      );
    }
    const bucketErr = lifecycleBucketError(abs, manifest.status.lifecycle);
    if (bucketErr) errors.push(`${key}: ${bucketErr}`);
    let computed: string | null = null;
    try {
      computed = skillArtifactHash(abs, manifest);
    } catch (err) {
      errors.push(`${key}: cannot hash skill artifact: ${err instanceof Error ? err.message : String(err)}`);
    }
    const published = entry.artifact_hash ?? null;
    if (computed) {
      if (manifest.status.lifecycle === "production" || manifest.status.lifecycle === "deprecated") {
        if (!published) {
          errors.push(
            `${key}: production/deprecated skills require registry artifact_hash (published pin). Compile the skill and record the hash.`,
          );
        } else if (published !== computed) {
          errors.push(
            `${key}: published artifact_hash mismatch (registry ${published.slice(0, 12)}… vs disk ${computed.slice(0, 12)}…). Bump the version; do not mutate a released pin.`,
          );
        }
      } else if (published && published !== computed) {
        errors.push(
          `${key}: registry artifact_hash is stale relative to disk. Update the registry hash or bump the version.`,
        );
      }
    }
  }

  for (const onDisk of listSkillLocations(repoRoot)) {
    if (isCatalogExemptSkillDir(onDisk)) continue;
    const manifestPath = join(onDisk, "manifest.yaml");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = loadYamlFile<SkillManifest>(manifestPath);
      const key = `${manifest.id}@${manifest.version}`;
      if (!registeredSkillKeys.has(key)) {
        errors.push(`unregistered skill on disk: ${relative(repoRoot, onDisk)} (${key})`);
      }
    } catch {
      errors.push(`unreadable skill on disk: ${relative(repoRoot, onDisk)}`);
    }
  }

  const registeredAgents = new Set<string>();
  for (const entry of agentsReg.data.agents ?? []) {
    if (registeredAgents.has(entry.id)) {
      errors.push(`registry/agents.yaml: duplicate agent ${entry.id}`);
      continue;
    }
    registeredAgents.add(entry.id);
    const abs = resolve(repoRoot, entry.path);
    if (!existsSync(join(abs, "manifest.yaml"))) {
      errors.push(`registry/agents.yaml: ${entry.id} path missing: ${entry.path}`);
      continue;
    }
    const manifest = loadYamlFile<AgentManifest>(join(abs, "manifest.yaml"));
    if (manifest.id !== entry.id) {
      errors.push(`registry/agents.yaml: ${entry.id} does not match manifest.id ${manifest.id}`);
    }
    if (manifest.version !== entry.version) {
      errors.push(`registry/agents.yaml: ${entry.id} version ${entry.version} does not match manifest ${manifest.version}`);
    }
    if (manifest.metadata.status !== entry.status) {
      errors.push(
        `registry/agents.yaml: ${entry.id} status "${entry.status}" does not match manifest "${manifest.metadata.status}"`,
      );
    }
  }

  const agentsRoot = join(repoRoot, "agents");
  if (existsSync(agentsRoot)) {
    for (const name of readdirSync(agentsRoot)) {
      const dir = join(agentsRoot, name);
      if (isCatalogExemptAgentDir(dir)) continue;
      if (!existsSync(join(dir, "manifest.yaml"))) continue;
      if (!registeredAgents.has(name)) {
        errors.push(`unregistered agent on disk: agents/${name}`);
      }
    }
  }

  return errors;
}

export function indexSkills(repoRoot: string): { skills: SkillRecord[]; errors: string[] } {
  const { data, errors } = loadRegistryFile(repoRoot, "skills.yaml");
  const skills: SkillRecord[] = [];
  for (const entry of data.skills ?? []) {
    const abs = resolve(repoRoot, entry.path);
    if (!existsSync(join(abs, "manifest.yaml"))) {
      errors.push(`registered skill ${entry.id}@${entry.version} missing at ${entry.path}`);
      continue;
    }
    const manifest = loadYamlFile<SkillManifest>(join(abs, "manifest.yaml"));
    skills.push({
      id: entry.id,
      version: entry.version,
      path: abs,
      lifecycle: manifest.status.lifecycle,
      artifact_hash: entry.artifact_hash ?? null,
      manifest,
    });
  }
  return { skills, errors };
}

export function findSkill(
  repoRoot: string,
  id: string,
  version: string,
): { record?: SkillRecord; error?: string } {
  const { data, errors } = loadRegistryFile(repoRoot, "skills.yaml");
  if (errors.length) {
    return { error: errors.join("; ") };
  }
  const entry = (data.skills ?? []).find((s) => s.id === id && s.version === version);
  if (!entry) {
    const available = (data.skills ?? []).filter((s) => s.id === id).map((s) => s.version);
    if (available.length) {
      return {
        error: `skill ${id}@${version} is not registered; available registered versions: ${available.join(", ")}`,
      };
    }
    return { error: `skill ${id}@${version} is not registered` };
  }
  const abs = resolve(repoRoot, entry.path);
  if (!existsSync(join(abs, "manifest.yaml"))) {
    return { error: `registered skill ${id}@${version} is missing on disk at ${entry.path}` };
  }
  const manifest = loadYamlFile<SkillManifest>(join(abs, "manifest.yaml"));
  return {
    record: {
      id: entry.id,
      version: entry.version,
      path: abs,
      lifecycle: manifest.status.lifecycle,
      artifact_hash: entry.artifact_hash ?? null,
      manifest,
    },
  };
}

export function findAgentRecord(repoRoot: string, agentId: string): { record?: AgentRecord; error?: string } {
  const { data, errors } = loadRegistryFile(repoRoot, "agents.yaml");
  if (errors.length) return { error: errors.join("; ") };
  const entry = (data.agents ?? []).find((a) => a.id === agentId);
  if (!entry) return { error: `agent ${agentId} is not registered` };
  return { record: entry };
}

export function findToolIds(repoRoot: string): string[] {
  const { data } = loadRegistryFile(repoRoot, "tools.yaml");
  return (data.tools ?? []).map((t) => t.id);
}

export function assertKnownTool(repoRoot: string, toolId: string): string | null {
  const known = findToolIds(repoRoot);
  if (!known.includes(toolId)) {
    return `unknown tool "${toolId}" (not in registry/tools.yaml; empty registry allows no tools)`;
  }
  return null;
}
