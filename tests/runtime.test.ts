import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { agentContractHash, compiledSkillRefFrom } from "../src/artifact.ts";
import { compileAgent } from "../src/compile.ts";
import { findSkill } from "../src/registry.ts";
import {
  AgentContractMismatch,
  CapabilityExecutionNotImplemented,
  CapabilityNotDeclared,
  EnvelopeMismatch,
  ImplicitVersionError,
  PermissionDenied,
  RegistryResolutionError,
  ReleaseHashMismatch,
  ReleaseNotFound,
  ReleaseSchemaInvalid,
  SkillArtifactHashMismatch,
  SkillNotFound,
  SkillNotProduction,
  SkillNotTrusted,
  SkillVersionMismatch,
} from "../src/runtime-errors.ts";
import { loadAgentRelease, parseExactReleasePin } from "../src/runtime-loader.ts";
import { executeCapability } from "../src/capability-gateway.ts";
import type { CompiledAgentPacket } from "../src/types.ts";
import type { RuntimeContext } from "../src/runtime-types.ts";
import { materializeWorkspace } from "./helpers.ts";

const PRODUCTION_SKILL = join("skills", "production", "claim-check", "1.0.0");

function tmpRoot(): string {
  return materializeWorkspace(join(mkdtempSync(join(tmpdir(), "agent-os-rt-")), "ws"));
}

function packetPath(root: string, agent = "gate-agent", version = "1.0.0"): string {
  return join(root, "releases", "agents", agent, version, "packet.json");
}

function readPacket(root: string): CompiledAgentPacket {
  return JSON.parse(readFileSync(packetPath(root), "utf8")) as CompiledAgentPacket;
}

function writePacket(root: string, packet: CompiledAgentPacket, rehash = false): void {
  if (rehash) {
    packet.hashes.contract = agentContractHash(packet);
    packet.runtime.stale_check.contract_hash = packet.hashes.contract;
  }
  writeFileSync(packetPath(root), JSON.stringify(packet, null, 2) + "\n");
}

function releaseGate(root: string): CompiledAgentPacket {
  return compileAgent(root, "gate-agent", { generatedAt: "2026-01-01T00:00:00.000Z", release: true });
}

function loadProd(root: string): RuntimeContext {
  return loadAgentRelease(root, "gate-agent", "1.0.0", { mode: "production" });
}

function expectRuntimeError(fn: () => unknown, ctor: new (...args: never[]) => Error): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ctor, `expected ${ctor.name}, got ${err instanceof Error ? err.name : String(err)}`);
    return true;
  });
}

describe("production runtime loader", () => {
  it("A. loads a valid immutable production release", () => {
    const root = tmpRoot();
    const compiled = releaseGate(root);
    const ctx = loadProd(root);
    assert.equal(ctx.verified, true);
    assert.equal(ctx.mode, "production");
    assert.equal(ctx.isolation, "none");
    assert.equal(ctx.agent.id, "gate-agent");
    assert.equal(ctx.agent.version, "1.0.0");
    assert.equal(ctx.agent.contract_hash, compiled.hashes.contract);
    assert.equal(ctx.skills.length, 1);
    assert.equal(ctx.skills[0].id, "claim-check");
    assert.equal(ctx.skills[0].version, "1.0.0");
    assert.equal(ctx.skills[0].artifact_hash, compiled.skills[0].artifact_hash);
    assert.equal(ctx.skills[0].lifecycle, "production");
    assert.equal(ctx.skills[0].trusted, true);
    assert.deepEqual(ctx.capabilities.tools, []);
    assert.deepEqual(ctx.capabilities.connectors, []);
    assert.equal(ctx.release.path, packetPath(root));
    assert.ok(!JSON.stringify(ctx).includes("# Purpose"));
  });

  it("B. rejects a packet mutated after compilation", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.agent.name = "Tampered Gate";
    writePacket(root, packet, false);
    expectRuntimeError(() => loadProd(root), ReleaseHashMismatch);
  });

  it("C. rejects a modified agent contract hash", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.hashes.contract = "0".repeat(64);
    packet.runtime.stale_check.contract_hash = packet.hashes.contract;
    writePacket(root, packet, false);
    expectRuntimeError(() => loadProd(root), ReleaseHashMismatch);
  });

  it("D. rejects skill source mutated without a version/hash update", () => {
    const root = tmpRoot();
    releaseGate(root);
    const skillMd = join(root, PRODUCTION_SKILL, "SKILL.md");
    writeFileSync(skillMd, readFileSync(skillMd, "utf8") + "\n# mutated without bump\n");
    expectRuntimeError(() => loadProd(root), SkillArtifactHashMismatch);
  });

  it("E. rejects a skill artifact hash mismatch in the packet", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.skills[0].artifact_hash = "a".repeat(64);
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), SkillArtifactHashMismatch);
  });

  it("F. rejects a candidate skill referenced by a production agent", () => {
    const root = tmpRoot();
    releaseGate(root);
    const found = findSkill(root, "source-verification", "1.0.0");
    assert.ok(found.record);
    const packet = readPacket(root);
    packet.skills = [
      compiledSkillRefFrom(found.record.path, relative(root, found.record.path), found.record.manifest),
    ];
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), SkillNotProduction);
  });

  it("G. rejects a deprecated skill referenced by a production agent", () => {
    const root = tmpRoot();
    releaseGate(root);
    const manifestPath = join(root, PRODUCTION_SKILL, "manifest.yaml");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace("lifecycle: production", "lifecycle: deprecated"),
    );
    const packet = readPacket(root);
    packet.skills[0].lifecycle = "deprecated";
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), SkillNotProduction);
  });

  it("H. rejects an unregistered skill", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.skills[0].id = "ghost-skill";
    packet.skills[0].pin = "ghost-skill@1.0.0";
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), SkillNotFound);
  });

  it("I. rejects the wrong skill version", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.skills[0].version = "2.0.0";
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), SkillVersionMismatch);
  });

  it("J. rejects a mutated permission envelope", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.skills[0].permissions.network = true;
    writePacket(root, packet, false);
    expectRuntimeError(() => loadProd(root), ReleaseHashMismatch);

    const root2 = tmpRoot();
    releaseGate(root2);
    const live = readPacket(root2);
    live.skills[0].permissions.network = true;
    writePacket(root2, live, true);
    expectRuntimeError(() => loadProd(root2), EnvelopeMismatch);
  });

  it("K. rejects an undeclared / unregistered tool in the packet", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.tools = ["web-search"];
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), RegistryResolutionError);
  });

  it("L. rejects an undeclared connector", () => {
    const root = tmpRoot();
    releaseGate(root);
    const packet = readPacket(root);
    packet.skills[0].requirements.connectors = ["github"];
    writePacket(root, packet, true);
    expectRuntimeError(() => loadProd(root), EnvelopeMismatch);
  });

  it("M. rejects a capability request outside the declared envelope", () => {
    const root = tmpRoot();
    releaseGate(root);
    const ctx = loadProd(root);
    expectRuntimeError(
      () => executeCapability(ctx, { kind: "tool", name: "web-search" }),
      CapabilityNotDeclared,
    );
    expectRuntimeError(() => executeCapability(ctx, { kind: "connector", name: "github" }), CapabilityNotDeclared);
    expectRuntimeError(() => executeCapability(ctx, { kind: "network" }), PermissionDenied);
  });

  it("N. does not discover extra skills that exist only on disk", () => {
    const root = tmpRoot();
    releaseGate(root);
    mkdirSync(join(root, "skills", "production", "disk-only", "1.0.0"), { recursive: true });
    writeFileSync(
      join(root, "skills", "production", "disk-only", "1.0.0", "manifest.yaml"),
      "id: disk-only\nversion: 1.0.0\n",
    );
    const ctx = loadProd(root);
    assert.deepEqual(
      ctx.skills.map((s) => s.id),
      ["claim-check"],
    );
  });

  it("O. makes latest / implicit version resolution impossible", () => {
    assert.throws(() => parseExactReleasePin("gate-agent@latest"), ImplicitVersionError);
    assert.throws(() => parseExactReleasePin("gate-agent"), ImplicitVersionError);
    assert.throws(() => parseExactReleasePin("gate-agent@1.0"), ImplicitVersionError);
    const root = tmpRoot();
    releaseGate(root);
    expectRuntimeError(() => loadAgentRelease(root, "gate-agent", "latest"), ImplicitVersionError);
    expectRuntimeError(() => loadAgentRelease(root, "gate-agent", "1.0"), ImplicitVersionError);
  });

  it("P. development mode does not satisfy production mode", () => {
    const root = tmpRoot();
    compileAgent(root, "gate-agent", { generatedAt: "2026-01-01T00:00:00.000Z", release: false });
    const dev = loadAgentRelease(root, "gate-agent", "1.0.0", { mode: "development" });
    assert.equal(dev.mode, "development");
    assert.equal(dev.verified, true);
    expectRuntimeError(() => loadProd(root), ReleaseNotFound);

    compileAgent(root, "fixture-agent", { generatedAt: "2026-01-01T00:00:00.000Z", release: true });
    expectRuntimeError(() => loadAgentRelease(root, "fixture-agent", "1.0.0", { mode: "production" }), AgentContractMismatch);
    const fixtureDev = loadAgentRelease(root, "fixture-agent", "1.0.0", { mode: "development" });
    assert.equal(fixtureDev.mode, "development");
    assert.equal(fixtureDev.agent.status, "fixture");
  });

  it("Q. lab mode cannot be mistaken for production", () => {
    const root = tmpRoot();
    compileAgent(root, "fixture-agent", { generatedAt: "2026-01-01T00:00:00.000Z", release: true });
    const lab = loadAgentRelease(root, "fixture-agent", "1.0.0", { mode: "lab" });
    assert.equal(lab.mode, "lab");
    assert.notEqual(lab.mode, "production");
    assert.equal(lab.agent.status, "fixture");
    assert.equal(lab.skills[0].lifecycle, "fixture");
    expectRuntimeError(() => loadAgentRelease(root, "fixture-agent", "1.0.0", { mode: "production" }), AgentContractMismatch);
  });

  it("rejects a missing release, invalid schema, and untrusted skills", () => {
    const root = tmpRoot();
    expectRuntimeError(() => loadProd(root), ReleaseNotFound);
    releaseGate(root);
    writeFileSync(packetPath(root), "{not-json");
    expectRuntimeError(() => loadProd(root), ReleaseSchemaInvalid);

    const root2 = tmpRoot();
    releaseGate(root2);
    const manifestPath = join(root2, PRODUCTION_SKILL, "manifest.yaml");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace("trusted: true", "trusted: false"));
    expectRuntimeError(() => loadProd(root2), SkillNotTrusted);
  });

  it("gateway throws not-implemented only after an allowed capability", () => {
    const ctx = {
      mode: "production",
      verified: true,
      agent: {
        id: "synthetic",
        name: "Synthetic",
        version: "1.0.0",
        status: "production",
        contract_hash: "0".repeat(64),
        tools: ["noop"],
      },
      release: {
        path: "/tmp/packet.json",
        version: "1.0.0",
        commit: null,
        generated_at: "2026-01-01T00:00:00.000Z",
        dirty: false,
      },
      skills: [],
      capabilities: {
        tools: ["noop"],
        connectors: [],
        permissions: { network: false, filesystem: false, execution: false, destructive: false },
      },
      provenance: { loader: "agent-os", sync: "on-session-start", registry_agent_id: "synthetic" },
      isolation: "none",
    } as const satisfies RuntimeContext;
    expectRuntimeError(() => executeCapability(ctx, { kind: "tool", name: "noop" }), CapabilityExecutionNotImplemented);
  });
});
