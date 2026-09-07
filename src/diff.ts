import { existsSync, readFileSync } from "node:fs";
import { compileAgent, compileSkill } from "./compile.ts";
import { findSkill } from "./registry.ts";
import { agentReleasePath, skillReleasePath } from "./packet.ts";
import { skillArtifactHash } from "./artifact.ts";

export type DiffResult = {
  target: string;
  hasPrevious: boolean;
  previousHash?: string;
  currentHash: string;
  changed: boolean;
  details: string[];
};

export function diffAgent(repoRoot: string, agentId: string): DiffResult {
  const current = compileAgent(repoRoot, agentId, {
    generatedAt: "1970-01-01T00:00:00.000Z",
    write: false,
  });
  const releasePacket = agentReleasePath(repoRoot, agentId, current.agent.version);
  if (!existsSync(releasePacket)) {
    return {
      target: `agent ${agentId}`,
      hasPrevious: false,
      currentHash: current.hashes.contract,
      changed: true,
      details: [
        `no released packet at releases/agents/${agentId}/${current.agent.version}/packet.json; working tree contract hash ${current.hashes.contract}`,
      ],
    };
  }
  const previous = JSON.parse(readFileSync(releasePacket, "utf8"));
  const details: string[] = [];
  if (previous.hashes?.contract !== current.hashes.contract) {
    details.push(`contract hash ${previous.hashes.contract} -> ${current.hashes.contract}`);
  }
  if (previous.agent?.version !== current.agent.version) {
    details.push(`version ${previous.agent.version} -> ${current.agent.version}`);
  }
  compareSkills(previous.skills ?? [], current.skills, details);
  return {
    target: `agent ${agentId}`,
    hasPrevious: true,
    previousHash: previous.hashes.contract,
    currentHash: current.hashes.contract,
    changed: details.length > 0,
    details: details.length ? details : ["no contract changes relative to released packet"],
  };
}

export function diffSkill(repoRoot: string, skillId: string, version: string): DiffResult {
  const current = compileSkill(repoRoot, skillId, version, {
    generatedAt: "1970-01-01T00:00:00.000Z",
    write: false,
  });
  const found = findSkill(repoRoot, skillId, version);
  const live = found.record ? skillArtifactHash(found.record.path, found.record.manifest) : current.hashes.artifact;
  const releasePacket = skillReleasePath(repoRoot, skillId, version);
  if (!existsSync(releasePacket)) {
    return {
      target: `skill ${skillId}@${version}`,
      hasPrevious: false,
      currentHash: current.hashes.artifact,
      changed: true,
      details: [`no released packet; working tree artifact hash ${live}`],
    };
  }
  const previous = JSON.parse(readFileSync(releasePacket, "utf8"));
  const details: string[] = [];
  if (previous.hashes?.artifact !== current.hashes.artifact) {
    details.push(`artifact hash ${previous.hashes.artifact} -> ${current.hashes.artifact}`);
  }
  return {
    target: `skill ${skillId}@${version}`,
    hasPrevious: true,
    previousHash: previous.hashes.artifact,
    currentHash: current.hashes.artifact,
    changed: details.length > 0,
    details: details.length ? details : ["no artifact changes relative to released packet"],
  };
}

function compareSkills(
  previous: Array<{ pin?: string; artifact_hash?: string }>,
  current: Array<{ pin?: string; artifact_hash?: string }>,
  details: string[],
): void {
  const prev = new Map(previous.map((s) => [s.pin, s.artifact_hash]));
  const cur = new Map(current.map((s) => [s.pin, s.artifact_hash]));
  for (const [pin, hash] of cur) {
    if (!pin) continue;
    if (!prev.has(pin)) details.push(`added skill ${pin}`);
    else if (prev.get(pin) !== hash) details.push(`changed skill ${pin}`);
  }
  for (const pin of prev.keys()) {
    if (pin && !cur.has(pin)) details.push(`removed skill ${pin}`);
  }
}
