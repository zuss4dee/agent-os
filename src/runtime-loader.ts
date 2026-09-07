import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { agentContractHash, compiledSkillRefFrom, skillArtifactHash } from "./artifact.ts";
import { isProductionAgent, productionAgentMayPin } from "./lifecycle.ts";
import { agentReleasePath, assertAgentPacketValid } from "./packet.ts";
import { findAgentRecord, findSkill, findToolIds, loadRegistryFile } from "./registry.ts";
import {
  AgentContractMismatch,
  EnvelopeMismatch,
  ImplicitVersionError,
  RegistryResolutionError,
  ReleaseHashMismatch,
  ReleaseNotFound,
  ReleaseSchemaInvalid,
  SkillArtifactHashMismatch,
  SkillNotFound,
  SkillNotProduction,
  SkillNotTrusted,
  SkillVersionMismatch,
} from "./runtime-errors.ts";
import type { RuntimeContext, RuntimeMode, RuntimeSkill } from "./runtime-types.ts";
import { SEMVER, SKILL_PIN, parseSkillPin } from "./semver.ts";
import { validateAgainstSchema } from "./schema.ts";
import type { CompiledAgentPacket, CompiledSkillRef, PermissionEnvelope } from "./types.ts";
import { ValidationFailed } from "./errors.ts";
import { join } from "node:path";

export type LoadOptions = {
  mode?: RuntimeMode;
};

export function parseExactReleasePin(value: string): { id: string; version: string } {
  const trimmed = value.trim();
  if (!trimmed || /latest/i.test(trimmed) || trimmed.endsWith("@") || !trimmed.includes("@")) {
    throw new ImplicitVersionError(trimmed || "(empty)");
  }
  if (!SKILL_PIN.test(trimmed)) {
    throw new ImplicitVersionError(trimmed);
  }
  const pin = parseSkillPin(trimmed);
  if (!SEMVER.test(pin.version)) {
    throw new ImplicitVersionError(trimmed);
  }
  return pin;
}

function packetPathForMode(repoRoot: string, agentId: string, version: string, mode: RuntimeMode): string {
  const release = agentReleasePath(repoRoot, agentId, version);
  if (mode === "production") return release;
  const cached = join(repoRoot, ".compiled", "agents", agentId, version, "packet.json");
  if (existsSync(cached)) return cached;
  return release;
}

function envelopesEqual(a: PermissionEnvelope, b: PermissionEnvelope): boolean {
  return (
    a.network === b.network &&
    a.filesystem === b.filesystem &&
    a.execution === b.execution &&
    a.destructive === b.destructive
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function unionPermissions(skills: RuntimeSkill[]): PermissionEnvelope {
  return {
    network: skills.some((s) => s.capabilities.permissions.network),
    filesystem: skills.some((s) => s.capabilities.permissions.filesystem),
    execution: skills.some((s) => s.capabilities.permissions.execution),
    destructive: skills.some((s) => s.capabilities.permissions.destructive),
  };
}

function freezeContext(ctx: RuntimeContext): RuntimeContext {
  Object.freeze(ctx.agent);
  Object.freeze(ctx.release);
  Object.freeze(ctx.capabilities);
  Object.freeze(ctx.capabilities.permissions);
  Object.freeze(ctx.capabilities.tools);
  Object.freeze(ctx.capabilities.connectors);
  Object.freeze(ctx.provenance);
  for (const skill of ctx.skills) {
    Object.freeze(skill);
    Object.freeze(skill.capabilities);
    Object.freeze(skill.capabilities.permissions);
    Object.freeze(skill.capabilities.tools);
    Object.freeze(skill.capabilities.connectors);
  }
  Object.freeze(ctx.skills);
  return Object.freeze(ctx);
}

function verifyProductionSkill(ref: CompiledSkillRef, live: CompiledSkillRef, liveTrusted: boolean): void {
  if (!productionAgentMayPin(ref.lifecycle) || !productionAgentMayPin(live.lifecycle)) {
    throw new SkillNotProduction(ref.id, ref.version, live.lifecycle);
  }
  if (!ref.trusted || !liveTrusted || !live.trusted) {
    throw new SkillNotTrusted(ref.id, ref.version, [`packet trusted=${ref.trusted}`, `live trusted=${live.trusted}`]);
  }
}

export function loadAgentRelease(repoRoot: string, agentId: string, version: string, options: LoadOptions = {}): RuntimeContext {
  const mode: RuntimeMode = options.mode ?? "production";
  if (!SEMVER.test(version) || /latest/i.test(version)) {
    throw new ImplicitVersionError(`${agentId}@${version}`);
  }

  const { data: skillsReg, errors: skillRegErrors } = loadRegistryFile(repoRoot, "skills.yaml");
  const { data: agentsReg, errors: agentRegErrors } = loadRegistryFile(repoRoot, "agents.yaml");
  if (skillRegErrors.length || agentRegErrors.length) {
    throw new RegistryResolutionError("Registry is not readable/valid", [...agentRegErrors, ...skillRegErrors]);
  }

  const registered = findAgentRecord(repoRoot, agentId);
  if (registered.error || !registered.record) {
    throw new RegistryResolutionError(registered.error ?? `agent ${agentId} is not registered`);
  }
  if (!(agentsReg.agents ?? []).some((a) => a.id === agentId)) {
    throw new RegistryResolutionError(`agent ${agentId} is not registered`);
  }

  const path = packetPathForMode(repoRoot, agentId, version, mode);
  if (!existsSync(path)) {
    throw new ReleaseNotFound(agentId, version, path);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ReleaseSchemaInvalid(agentId, version, [
      `packet is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  const schemaErrors = validateAgainstSchema(repoRoot, "compiled-agent.schema.json", raw);
  if (schemaErrors.length) {
    throw new ReleaseSchemaInvalid(agentId, version, schemaErrors);
  }
  try {
    assertAgentPacketValid(repoRoot, raw);
  } catch (err) {
    if (err instanceof ValidationFailed) {
      throw new ReleaseSchemaInvalid(agentId, version, err.details);
    }
    throw err;
  }

  const packet = raw as CompiledAgentPacket;
  if (packet.agent.id !== agentId || packet.agent.version !== version) {
    throw new AgentContractMismatch(agentId, version, [
      `packet identity ${packet.agent.id}@${packet.agent.version}`,
      `requested ${agentId}@${version}`,
    ]);
  }

  const recomputed = agentContractHash(packet);
  if (recomputed !== packet.hashes.contract || packet.runtime.stale_check.contract_hash !== packet.hashes.contract) {
    throw new ReleaseHashMismatch(agentId, version, packet.hashes.contract, recomputed);
  }

  if (mode === "production") {
    if (!isProductionAgent(packet.agent.status)) {
      throw new AgentContractMismatch(agentId, version, [
        `production runtime requires agent status production, packet has "${packet.agent.status}"`,
      ]);
    }
  }

  const knownTools = new Set(findToolIds(repoRoot));
  for (const tool of packet.tools) {
    if (!knownTools.has(tool)) {
      throw new RegistryResolutionError(`unknown tool "${tool}" in packet (not in registry/tools.yaml)`);
    }
  }

  const skills: RuntimeSkill[] = [];
  for (const ref of packet.skills) {
    if (ref.id !== parseSkillPin(ref.pin).id || ref.version !== parseSkillPin(ref.pin).version) {
      throw new SkillVersionMismatch(ref.id, ref.pin, `${ref.id}@${ref.version}`);
    }
    const found = findSkill(repoRoot, ref.id, ref.version);
    if (!found.record) {
      throw new SkillNotFound(ref.id, ref.version, [found.error ?? "not registered"]);
    }
    if (found.record.version !== ref.version) {
      throw new SkillVersionMismatch(ref.id, ref.version, found.record.version);
    }
    const catalog = (skillsReg.skills ?? []).find((s) => s.id === ref.id && s.version === ref.version);
    if (!catalog) {
      throw new SkillNotFound(ref.id, ref.version, ["absent from registry/skills.yaml"]);
    }
    const live = compiledSkillRefFrom(found.record.path, relative(repoRoot, found.record.path), found.record.manifest);
    if (mode === "production") {
      verifyProductionSkill(ref, live, found.record.manifest.status.trusted === true);
    } else if (mode === "development") {
      if (isProductionAgent(packet.agent.status) && !productionAgentMayPin(live.lifecycle)) {
        throw new SkillNotProduction(ref.id, ref.version, live.lifecycle);
      }
    }

    const liveHash = skillArtifactHash(found.record.path, found.record.manifest);
    const published = found.record.artifact_hash;
    if (liveHash !== ref.artifact_hash) {
      throw new SkillArtifactHashMismatch(ref.id, ref.version, [
        `packet ${ref.artifact_hash}`,
        `live ${liveHash}`,
      ]);
    }
    if (published && published !== ref.artifact_hash) {
      throw new SkillArtifactHashMismatch(ref.id, ref.version, [
        `packet ${ref.artifact_hash}`,
        `registry ${published}`,
      ]);
    }
    if (mode === "production" && !published) {
      throw new SkillArtifactHashMismatch(ref.id, ref.version, [
        "production skills require registry artifact_hash",
      ]);
    }

    if (!envelopesEqual(ref.permissions, live.permissions)) {
      throw new EnvelopeMismatch(ref.id, ref.version, ["permissions differ between packet and live skill"]);
    }
    if (!sameSet(ref.requirements.tools, live.requirements.tools) || !sameSet(ref.requirements.connectors, live.requirements.connectors)) {
      throw new EnvelopeMismatch(ref.id, ref.version, ["tools/connectors differ between packet and live skill"]);
    }
    for (const tool of live.requirements.tools) {
      if (!knownTools.has(tool)) {
        throw new RegistryResolutionError(`skill ${ref.pin} requires unknown tool "${tool}"`);
      }
    }
    if (ref.lifecycle !== live.lifecycle) {
      if (mode === "production") throw new SkillNotProduction(ref.id, ref.version, live.lifecycle);
      throw new EnvelopeMismatch(ref.id, ref.version, [`packet lifecycle ${ref.lifecycle}`, `live ${live.lifecycle}`]);
    }

    skills.push({
      id: ref.id,
      version: ref.version,
      pin: ref.pin,
      artifact_hash: ref.artifact_hash,
      lifecycle: live.lifecycle,
      trusted: live.trusted,
      origin_type: live.origin_type,
      registry_path: catalog.path,
      capabilities: {
        tools: [...ref.requirements.tools],
        connectors: [...ref.requirements.connectors],
        permissions: { ...ref.permissions },
      },
    });
  }

  const tools = [...new Set([...packet.tools, ...skills.flatMap((s) => s.capabilities.tools)])].sort();
  const connectors = [...new Set(skills.flatMap((s) => s.capabilities.connectors))].sort();

  return freezeContext({
    mode,
    verified: true,
    agent: {
      id: packet.agent.id,
      name: packet.agent.name,
      version: packet.agent.version,
      status: packet.agent.status,
      contract_hash: packet.hashes.contract,
      tools: [...packet.tools],
    },
    release: {
      path,
      version: packet.agent.version,
      commit: packet.source.commit,
      generated_at: packet.source.generated_at,
      dirty: packet.source.dirty,
    },
    skills,
    capabilities: {
      tools,
      connectors,
      permissions: unionPermissions(skills),
    },
    provenance: {
      loader: packet.runtime.loader,
      sync: packet.runtime.sync,
      registry_agent_id: registered.record.id,
    },
    isolation: "none",
  });
}
