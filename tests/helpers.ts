import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadYamlFile, dumpYaml } from "../src/yaml.ts";
import { skillArtifactHash } from "../src/artifact.ts";
import type { SkillManifest } from "../src/types.ts";
import type { RegistryFile } from "../src/registry.ts";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURE_WORKSPACE = join(REPO_ROOT, "tests", "fixtures", "workspace");

export function materializeWorkspace(dest: string): string {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(FIXTURE_WORKSPACE, dest, { recursive: true });
  ensureLink(join(dest, "schemas"), join(REPO_ROOT, "schemas"));
  ensureLink(join(dest, "shared"), join(REPO_ROOT, "shared"));
  stampPublishedSkillHashes(dest);
  return dest;
}

export function stampPublishedSkillHashes(root: string): void {
  const path = join(root, "registry", "skills.yaml");
  const data = loadYamlFile<RegistryFile>(path);
  for (const entry of data.skills ?? []) {
    if (entry.lifecycle !== "production" && entry.lifecycle !== "deprecated") continue;
    const abs = resolve(root, entry.path);
    const manifest = loadYamlFile<SkillManifest>(join(abs, "manifest.yaml"));
    entry.artifact_hash = skillArtifactHash(abs, manifest);
  }
  writeFileSync(path, dumpYaml(data));
}

function ensureLink(dest: string, target: string): void {
  if (existsSync(dest)) return;
  symlinkSync(target, dest);
}
