import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sha256 } from "./hash.ts";
import { readGitSource } from "./git.ts";
import { DEFAULT_SHARED_POLICIES, readText } from "./paths.ts";
import { findSkill } from "./registry.ts";
import { formatSkillPin, parseSkillPin } from "./semver.ts";
import { loadEvalSuite } from "./changelog.ts";
import { ValidationFailed } from "./errors.ts";
import { validateAgentDir } from "./validate-agent.ts";
import { validateSkillDir } from "./validate-skill.ts";
import type { CompiledAgentPacket, CompiledSkillPacket } from "./types.ts";
import { agentContractHash, compiledSkillRefFrom, skillArtifactHash, skillRuntimeEnvelope } from "./artifact.ts";
import {
  agentReleasePath,
  assertAgentPacketValid,
  assertSkillPacketValid,
  skillReleasePath,
  writeImmutableRelease,
  writeJsonPacket,
} from "./packet.ts";

export type CompileOptions = {
  outDir?: string;
  generatedAt?: string;
  write?: boolean;
  release?: boolean;
};

export function compileAgent(repoRoot: string, agentId: string, options: CompileOptions = {}): CompiledAgentPacket {
  const agentDir = join(repoRoot, "agents", agentId);
  const validation = validateAgentDir(repoRoot, agentDir);
  if (!validation.ok || !validation.manifest) {
    throw new ValidationFailed(`agent ${agentId}`, validation.errors);
  }
  const manifest = validation.manifest;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const git = readGitSource(repoRoot);

  const identityPath = join(agentDir, manifest.prompt.profile);
  const systemPath = join(agentDir, manifest.prompt.system);
  const manualPath = join(agentDir, manifest.prompt.operating_manual);

  const policyNames = manifest.shared_policies ?? DEFAULT_SHARED_POLICIES;
  const shared_policies = policyNames.map((name) => {
    const path = join(repoRoot, "shared", name);
    return { id: name.replace(/\.md$/, ""), path: relative(repoRoot, path), sha256: sha256(readText(path)) };
  });

  const skills = [];
  for (const raw of manifest.skills) {
    const pin = parseSkillPin(raw);
    const found = findSkill(repoRoot, pin.id, pin.version);
    if (!found.record) {
      throw new ValidationFailed(`agent ${agentId}`, [found.error ?? "skill missing"]);
    }
    const skillValidation = validateSkillDir(repoRoot, found.record.path);
    if (!skillValidation.ok) {
      throw new ValidationFailed(`skill ${formatSkillPin(pin)} (required by ${agentId})`, skillValidation.errors);
    }
    skills.push(compiledSkillRefFrom(found.record.path, relative(repoRoot, found.record.path), found.record.manifest));
  }

  const knowledge = (manifest.knowledge ?? []).map((rel) => {
    const full = resolve(agentDir, rel);
    const kind = existsSync(full) && statSync(full).isDirectory() ? "dir" : "file";
    const hash =
      kind === "file" && existsSync(full)
        ? sha256(readText(full))
        : kind === "dir"
          ? hashDirectory(full)
          : null;
    return { path: rel, sha256: hash, kind: kind as "dir" | "file" };
  });

  const evalDir = join(agentDir, manifest.evaluation.suite);
  const evalResult = loadEvalSuite(repoRoot, evalDir);

  const packet: CompiledAgentPacket = {
    schema: "agent-os.compiled-agent.v1",
    agent: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      status: manifest.metadata.status,
    },
    source: {
      commit: git.commit,
      dirty: git.dirty,
      generated_at: generatedAt,
    },
    hashes: {
      contract: "",
    },
    identity: { path: relative(repoRoot, identityPath), sha256: sha256(readText(identityPath)) },
    instructions: {
      system: { path: relative(repoRoot, systemPath), sha256: sha256(readText(systemPath)) },
      operating_manual: { path: relative(repoRoot, manualPath), sha256: sha256(readText(manualPath)) },
      shared_policies,
    },
    skills,
    tools: manifest.tools ?? [],
    knowledge,
    evaluation: {
      suite: manifest.evaluation.suite,
      cases: evalResult.cases.map((c) => c.id),
    },
    runtime: {
      loader: manifest.runtime.loader,
      sync: manifest.runtime.sync ?? "on-session-start",
      stale_check: {
        contract_hash: "",
        commit: git.commit,
      },
      skill_retrieval: "reference-only",
    },
  };

  const contract = agentContractHash(packet);
  packet.hashes.contract = contract;
  packet.runtime.stale_check.contract_hash = contract;

  assertAgentPacketValid(repoRoot, packet);

  const shouldWrite = options.write !== false;
  if (shouldWrite) {
    const outDir = options.outDir ?? join(repoRoot, ".compiled", "agents", agentId, manifest.version);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "packet.json"), JSON.stringify(packet, null, 2) + "\n");
  }
  if (options.release) {
    writeImmutableRelease(agentReleasePath(repoRoot, manifest.id, manifest.version), packet);
  }
  return packet;
}

export function compileSkill(repoRoot: string, skillId: string, version: string, options: CompileOptions = {}): CompiledSkillPacket {
  const found = findSkill(repoRoot, skillId, version);
  if (!found.record) {
    throw new ValidationFailed(`skill ${skillId}@${version}`, [found.error ?? "not found"]);
  }
  const validation = validateSkillDir(repoRoot, found.record.path);
  if (!validation.ok || !validation.manifest) {
    throw new ValidationFailed(`skill ${skillId}@${version}`, validation.errors);
  }
  const manifest = validation.manifest;
  const git = readGitSource(repoRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const envelope = skillRuntimeEnvelope(found.record.path, manifest);
  const entryPath = join(found.record.path, manifest.runtime.entrypoint);
  const packet: CompiledSkillPacket = {
    schema: "agent-os.compiled-skill.v1",
    skill: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      lifecycle: manifest.status.lifecycle,
    },
    source: {
      commit: git.commit,
      dirty: git.dirty,
      generated_at: generatedAt,
    },
    hashes: { artifact: skillArtifactHash(found.record.path, manifest) },
    entrypoint: { path: relative(repoRoot, entryPath), sha256: envelope.entrypoint_sha256 },
    origin_type: envelope.origin_type,
    permissions: envelope.permissions,
    requirements: { tools: envelope.tools, connectors: envelope.connectors },
    runtime: { type: envelope.runtime_type, entrypoint: envelope.entrypoint },
    trusted: envelope.trusted,
  };
  assertSkillPacketValid(repoRoot, packet);
  const shouldWrite = options.write !== false;
  if (shouldWrite) {
    const outDir = options.outDir ?? join(repoRoot, ".compiled", "skills", skillId, version);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "packet.json"), JSON.stringify(packet, null, 2) + "\n");
  }
  if (options.release) {
    writeImmutableRelease(skillReleasePath(repoRoot, manifest.id, manifest.version), packet);
  }
  return packet;
}

export function writeMalformedPacketForTest(repoRoot: string, dest: string, packet: unknown): void {
  assertAgentPacketValid(repoRoot, packet);
  writeJsonPacket(dest, packet);
}

function hashDirectory(dir: string): string {
  const parts: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else parts.push(`${relative(dir, full)}:${sha256(readText(full))}`);
    }
  };
  walk(dir);
  return sha256(parts.join("\n"));
}
