import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateAgainstSchema } from "./schema.ts";
import { ValidationFailed } from "./errors.ts";
import type { CompiledAgentPacket, CompiledSkillPacket } from "./types.ts";

export function assertAgentPacketValid(repoRoot: string, packet: unknown): void {
  const errors = validateAgainstSchema(repoRoot, "compiled-agent.schema.json", packet);
  if (errors.length) {
    throw new ValidationFailed("compiled agent packet", errors);
  }
}

export function assertSkillPacketValid(repoRoot: string, packet: unknown): void {
  const errors = validateAgainstSchema(repoRoot, "compiled-skill.schema.json", packet);
  if (errors.length) {
    throw new ValidationFailed("compiled skill packet", errors);
  }
}

export function writeJsonPacket(dest: string, packet: unknown): void {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(packet, null, 2) + "\n");
}

export function agentReleasePath(repoRoot: string, agentId: string, version: string): string {
  return join(repoRoot, "releases", "agents", agentId, version, "packet.json");
}

export function skillReleasePath(repoRoot: string, skillId: string, version: string): string {
  return join(repoRoot, "releases", "skills", skillId, version, "packet.json");
}

export function writeImmutableRelease(dest: string, packet: unknown): void {
  if (existsSync(dest)) {
    throw new ValidationFailed(dest, [
      `refusing to overwrite released packet ${dest}. Bump the version to publish a new artifact.`,
    ]);
  }
  writeJsonPacket(dest, packet);
}
