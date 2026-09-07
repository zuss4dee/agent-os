import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SHARED_POLICIES = [
  "principles.md",
  "quality-bar.md",
  "anti-slop.md",
  "research-protocol.md",
  "evidence-policy.md",
  "safety.md",
];

export const SKILL_LIFECYCLE_DIRS = ["production", "candidates", "deprecated"] as const;

export type RepoPaths = {
  root: string;
  agents: string;
  skills: string;
  shared: string;
  registry: string;
  schemas: string;
  releases: string;
  lab: string;
};

export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, "schemas", "agent-manifest.schema.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return resolve(join(THIS_DIR, ".."));
    }
    dir = parent;
  }
}

export function pathsFor(root: string): RepoPaths {
  return {
    root,
    agents: join(root, "agents"),
    skills: join(root, "skills"),
    shared: join(root, "shared"),
    registry: join(root, "registry"),
    schemas: join(root, "schemas"),
    releases: join(root, "releases"),
    lab: join(root, "lab"),
  };
}

export function agentDir(root: string, agentId: string): string {
  return join(root, "agents", agentId);
}

export function listSkillLocations(root: string): string[] {
  const found: string[] = [];
  const skillsRoot = join(root, "skills");
  if (!existsSync(skillsRoot)) return found;
  for (const lifecycle of SKILL_LIFECYCLE_DIRS) {
    const bucket = join(skillsRoot, lifecycle);
    if (!existsSync(bucket)) continue;
    for (const id of readdirSync(bucket)) {
      const idDir = join(bucket, id);
      if (!statSync(idDir).isDirectory()) continue;
      if (existsSync(join(idDir, "manifest.yaml"))) {
        found.push(idDir);
        continue;
      }
      for (const version of readdirSync(idDir)) {
        const versionDir = join(idDir, version);
        if (statSync(versionDir).isDirectory() && existsSync(join(versionDir, "manifest.yaml"))) {
          found.push(versionDir);
        }
      }
    }
  }
  return found;
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}
