import type { AgentStatus, SkillLifecycle, SkillManifest } from "./types.ts";

export const PRODUCTION_PINNABLE: ReadonlySet<SkillLifecycle> = new Set(["production"]);

export const REQUIRED_PRODUCTION_POLICIES = ["principles.md", "safety.md"] as const;

export const BUCKET_LIFECYCLES: Record<"candidates" | "production" | "deprecated", ReadonlySet<SkillLifecycle>> = {
  candidates: new Set([
    "discovered",
    "imported",
    "review",
    "adapted",
    "evaluated",
    "approved",
    "fixture",
  ]),
  production: new Set(["production"]),
  deprecated: new Set(["deprecated"]),
};

export function diskBucketFromPath(skillDir: string): "candidates" | "production" | "deprecated" | null {
  const parts = skillDir.split(/[/\\]/);
  const idx = parts.lastIndexOf("skills");
  if (idx === -1 || idx + 1 >= parts.length) return null;
  const bucket = parts[idx + 1];
  if (bucket === "candidates" || bucket === "production" || bucket === "deprecated") return bucket;
  return null;
}

export function lifecycleBucketError(skillDir: string, lifecycle: SkillLifecycle): string | null {
  if (skillDir.includes("_template")) return null;
  const bucket = diskBucketFromPath(skillDir);
  if (!bucket) {
    return `skill must live under skills/candidates, skills/production, or skills/deprecated (found ${skillDir})`;
  }
  if (!BUCKET_LIFECYCLES[bucket].has(lifecycle)) {
    return `lifecycle "${lifecycle}" is not allowed under skills/${bucket}/`;
  }
  return null;
}

export function productionAgentMayPin(lifecycle: SkillLifecycle): boolean {
  return PRODUCTION_PINNABLE.has(lifecycle);
}

export function isProductionAgent(status: AgentStatus): boolean {
  return status === "production";
}

export function isCatalogExemptAgentDir(agentDirectory: string): boolean {
  const parts = agentDirectory.split(/[/\\]/).filter(Boolean);
  const name = parts.at(-1) ?? "";
  return name.startsWith("_");
}

export function isCatalogExemptSkillDir(skillDir: string): boolean {
  return skillDir.includes(`${"skills"}/_template`) || skillDir.includes("_template");
}
