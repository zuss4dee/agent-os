import { join } from "node:path";
import { contentHash, sha256 } from "./hash.ts";
import { readText } from "./paths.ts";
import type { CompiledAgentPacket, CompiledSkillRef, SkillManifest } from "./types.ts";

export type SkillRuntimeEnvelope = {
  id: string;
  version: string;
  entrypoint: string;
  entrypoint_sha256: string;
  runtime_type: SkillManifest["runtime"]["type"];
  permissions: {
    network: boolean;
    filesystem: boolean;
    execution: boolean;
    destructive: boolean;
  };
  tools: string[];
  connectors: string[];
  origin_type: SkillManifest["origin"]["type"];
  trusted: boolean;
};

export function skillRuntimeEnvelope(skillDir: string, manifest: SkillManifest): SkillRuntimeEnvelope {
  const entry = join(skillDir, manifest.runtime.entrypoint);
  const entryText = readText(entry);
  return {
    id: manifest.id,
    version: manifest.version,
    entrypoint: manifest.runtime.entrypoint,
    entrypoint_sha256: sha256(entryText),
    runtime_type: manifest.runtime.type,
    permissions: {
      network: manifest.permissions.network,
      filesystem: manifest.permissions.filesystem,
      execution: manifest.permissions.execution,
      destructive: manifest.permissions.destructive === true,
    },
    tools: [...(manifest.requirements.tools ?? [])].sort(),
    connectors: [...(manifest.requirements.connectors ?? [])].sort(),
    origin_type: manifest.origin.type,
    trusted: manifest.status.trusted === true,
  };
}

/** Canonical hash of the skill artifact a packet may pin. Does not include evals, examples, changelog, or references. */
export function skillArtifactHash(skillDir: string, manifest: SkillManifest): string {
  return contentHash(skillRuntimeEnvelope(skillDir, manifest));
}

export function compiledSkillRefFrom(
  skillDir: string,
  relativePath: string,
  manifest: SkillManifest,
): CompiledSkillRef {
  const envelope = skillRuntimeEnvelope(skillDir, manifest);
  return {
    id: manifest.id,
    version: manifest.version,
    pin: `${manifest.id}@${manifest.version}`,
    path: relativePath,
    lifecycle: manifest.status.lifecycle,
    runtime_type: envelope.runtime_type,
    entrypoint: envelope.entrypoint,
    artifact_hash: contentHash(envelope),
    permissions: envelope.permissions,
    requirements: { tools: envelope.tools, connectors: envelope.connectors },
    origin_type: envelope.origin_type,
    trusted: envelope.trusted,
  };
}

export function agentContractPayload(packet: CompiledAgentPacket): unknown {
  return {
    agent: packet.agent,
    identity: packet.identity,
    instructions: packet.instructions,
    skills: packet.skills,
    tools: packet.tools,
    knowledge: packet.knowledge,
    runtime: {
      loader: packet.runtime.loader,
      sync: packet.runtime.sync,
      skill_retrieval: packet.runtime.skill_retrieval,
    },
  };
}

export function agentContractHash(packet: CompiledAgentPacket): string {
  return contentHash(agentContractPayload(packet));
}

export function skillMatchesExpectedHash(
  skillDir: string,
  manifest: SkillManifest,
  expectedHash: string,
): boolean {
  return skillArtifactHash(skillDir, manifest) === expectedHash;
}
