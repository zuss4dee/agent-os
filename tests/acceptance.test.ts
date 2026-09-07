import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { materializeWorkspace } from "./helpers.ts";
import { validateAgentDir } from "../src/validate-agent.ts";
import { validateSkillDir } from "../src/validate-skill.ts";
import { compileAgent, compileSkill, writeMalformedPacketForTest } from "../src/compile.ts";
import { scanPathForSecrets } from "../src/secrets.ts";
import { evaluateTarget } from "../src/evaluate.ts";
import { ValidationFailed } from "../src/errors.ts";
import { dumpYaml, loadYamlFile } from "../src/yaml.ts";
import type { RegistryFile } from "../src/registry.ts";
import { skillArtifactHash } from "../src/artifact.ts";
import type { SkillManifest } from "../src/types.ts";

const CANDIDATE = join("skills", "candidates", "source-verification", "1.0.0");
const PRODUCTION_SKILL = join("skills", "production", "claim-check", "1.0.0");

function tmpRoot(): string {
  return materializeWorkspace(join(mkdtempSync(join(tmpdir(), "agent-os-")), "ws"));
}

describe("Agent OS packet contract", () => {
  it("validates fixture skill/agent and production agent+skill", () => {
    const root = tmpRoot();
    assert.equal(validateSkillDir(root, join(root, CANDIDATE)).ok, true);
    assert.equal(validateAgentDir(root, join(root, "agents", "fixture-agent")).ok, true);
    const prodSkill = validateSkillDir(root, join(root, PRODUCTION_SKILL));
    assert.equal(prodSkill.ok, true, prodSkill.errors.join("\n"));
    const prodAgent = validateAgentDir(root, join(root, "agents", "gate-agent"));
    assert.equal(prodAgent.ok, true, prodAgent.errors.join("\n"));
    const packet = compileAgent(root, "gate-agent", { generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(packet.agent.status, "production");
    assert.equal(packet.skills[0].pin, "claim-check@1.0.0");
    assert.equal(packet.skills[0].permissions.network, false);
    assert.equal(packet.skills[0].trusted, true);
    assert.match(packet.hashes.contract, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(packet).includes("# Purpose"));
  });

  it("fails production agent pinning a candidate/fixture skill", () => {
    const root = tmpRoot();
    const manifestPath = join(root, "agents", "gate-agent", "manifest.yaml");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace("claim-check@1.0.0", "source-verification@1.0.0"),
    );
    const result = validateAgentDir(root, join(root, "agents", "gate-agent"));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("cannot pin")), result.errors.join("\n"));
  });

  it("fails unregistered skill pins and unknown tools", () => {
    const root = tmpRoot();
    const manifestPath = join(root, "agents", "gate-agent", "manifest.yaml");
    let text = readFileSync(manifestPath, "utf8");
    text = text.replace("claim-check@1.0.0", "does-not-exist@9.9.9");
    text = text.replace("tools: []", "tools:\n  - not-a-real-tool");
    writeFileSync(manifestPath, text);
    const result = validateAgentDir(root, join(root, "agents", "gate-agent"));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("not registered")), result.errors.join("\n"));
    assert.ok(result.errors.some((e) => e.includes("unknown tool")), result.errors.join("\n"));
  });

  it("fails unregistered agents on disk", () => {
    const root = tmpRoot();
    cpSync(join(root, "agents", "fixture-agent"), join(root, "agents", "ghost-agent"), { recursive: true });
    writeFileSync(
      join(root, "agents", "ghost-agent", "manifest.yaml"),
      readFileSync(join(root, "agents", "ghost-agent", "manifest.yaml"), "utf8").replaceAll(
        "fixture-agent",
        "ghost-agent",
      ),
    );
    const result = validateAgentDir(root, join(root, "agents", "fixture-agent"));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("unregistered agent")), result.errors.join("\n"));
  });

  it("fails lifecycle directory mismatch", () => {
    const root = tmpRoot();
    const manifestPath = join(root, PRODUCTION_SKILL, "manifest.yaml");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace("lifecycle: production", "lifecycle: imported"),
    );
    const result = validateSkillDir(root, join(root, PRODUCTION_SKILL));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("not allowed under skills/production")), result.errors.join("\n"));
  });

  it("detects mutating a published production pin without a version bump", () => {
    const root = tmpRoot();
    const skillMd = join(root, PRODUCTION_SKILL, "SKILL.md");
    writeFileSync(skillMd, readFileSync(skillMd, "utf8") + "\n# mutated without bump\n");
    const result = validateSkillDir(root, join(root, PRODUCTION_SKILL));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("artifact hash") || e.includes("published")), result.errors.join("\n"));
  });

  it("creates a new artifact when the version is bumped instead of mutating 1.0.0", () => {
    const root = tmpRoot();
    const v1 = compileSkill(root, "claim-check", "1.0.0", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    const dest = join(root, "skills", "production", "claim-check", "1.1.0");
    cpSync(join(root, PRODUCTION_SKILL), dest, { recursive: true });
    writeFileSync(join(dest, "SKILL.md"), readFileSync(join(dest, "SKILL.md"), "utf8") + "\n# v1.1\n");
    writeFileSync(
      join(dest, "manifest.yaml"),
      readFileSync(join(dest, "manifest.yaml"), "utf8").replace("version: 1.0.0", "version: 1.1.0"),
    );
    const skillsPath = join(root, "registry", "skills.yaml");
    const reg = loadYamlFile<RegistryFile>(skillsPath);
    const manifest = loadYamlFile<SkillManifest>(join(dest, "manifest.yaml"));
    reg.skills?.push({
      id: "claim-check",
      version: "1.1.0",
      path: "skills/production/claim-check/1.1.0",
      lifecycle: "production",
      artifact_hash: skillArtifactHash(dest, manifest),
    });
    writeFileSync(skillsPath, dumpYaml(reg));
    const v11 = compileSkill(root, "claim-check", "1.1.0", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    assert.notEqual(v11.hashes.artifact, v1.hashes.artifact);
    const stillV1 = compileSkill(root, "claim-check", "1.0.0", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    assert.equal(stillV1.hashes.artifact, v1.hashes.artifact);
  });

  it("permission-only edits change artifact and agent contract hashes", () => {
    const root = tmpRoot();
    const beforeSkill = compileSkill(root, "source-verification", "1.0.0", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    const beforeAgent = compileAgent(root, "fixture-agent", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    const manifestPath = join(root, CANDIDATE, "manifest.yaml");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace("network: false", "network: true"));
    const afterSkill = compileSkill(root, "source-verification", "1.0.0", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    const afterAgent = compileAgent(root, "fixture-agent", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    assert.notEqual(afterSkill.hashes.artifact, beforeSkill.hashes.artifact);
    assert.notEqual(afterAgent.hashes.contract, beforeAgent.hashes.contract);
    assert.equal(afterAgent.skills[0].permissions.network, true);
  });

  it("rejects writing a malformed compiled packet", () => {
    const root = tmpRoot();
    const dest = join(root, "bogus-packet.json");
    assert.throws(
      () => writeMalformedPacketForTest(root, dest, { schema: "nope" }),
      (err: unknown) => err instanceof ValidationFailed,
    );
    assert.equal(existsSync(dest), false);
  });

  it("refuses to overwrite a released agent packet", () => {
    const root = tmpRoot();
    compileAgent(root, "gate-agent", { generatedAt: "2026-01-01T00:00:00.000Z", release: true });
    assert.throws(
      () => compileAgent(root, "gate-agent", { generatedAt: "2026-01-01T00:00:00.000Z", release: true }),
      (err: unknown) => err instanceof ValidationFailed && String(err).includes("overwrite"),
    );
  });

  it("evaluate does not invent 1.0.0 for a bare skill id", () => {
    const root = tmpRoot();
    assert.throws(
      () => evaluateTarget(root, "source-verification"),
      (err: unknown) => err instanceof ValidationFailed && String(err).includes("id@version"),
    );
    const report = evaluateTarget(root, "source-verification@1.0.0");
    assert.equal(report.executed, false);
    assert.ok(report.cases.length >= 1);
  });

  it("fails production agents with empty shared policies", () => {
    const root = tmpRoot();
    const manifestPath = join(root, "agents", "gate-agent", "manifest.yaml");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace(/shared_policies:[\s\S]*?runtime:/, "shared_policies: []\n\nruntime:"),
    );
    const result = validateAgentDir(root, join(root, "agents", "gate-agent"));
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes("empty shared_policies") || e.includes("required shared policy")),
      result.errors.join("\n"),
    );
  });

  it("agent contract hash changes when a skill artifact changes", () => {
    const root = tmpRoot();
    const before = compileAgent(root, "fixture-agent", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    writeFileSync(join(root, CANDIDATE, "SKILL.md"), readFileSync(join(root, CANDIDATE, "SKILL.md"), "utf8") + "\n# dep\n");
    const after = compileAgent(root, "fixture-agent", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      write: false,
    });
    assert.notEqual(after.hashes.contract, before.hashes.contract);
    assert.notEqual(after.skills[0].artifact_hash, before.skills[0].artifact_hash);
  });

  it("flags undeclared executable capability", () => {
    const root = tmpRoot();
    const dir = join(root, "skills", "candidates", "unsafe-exec", "1.0.0");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "references"));
    mkdirSync(join(dir, "evals"));
    mkdirSync(join(dir, "examples", "good"), { recursive: true });
    mkdirSync(join(dir, "examples", "bad"), { recursive: true });
    writeFileSync(
      join(dir, "manifest.yaml"),
      readFileSync(join(root, CANDIDATE, "manifest.yaml"), "utf8")
        .replace("id: source-verification", "id: unsafe-exec")
        .replace("name: Source Verification", "name: Unsafe Exec"),
    );
    writeFileSync(join(dir, "SKILL.md"), "# Purpose\nRun a helper.\n");
    writeFileSync(join(dir, "run.sh"), "#!/bin/sh\necho pwn\n");
    writeFileSync(join(dir, "changelog.md"), readFileSync(join(root, CANDIDATE, "changelog.md"), "utf8"));
    writeFileSync(
      join(dir, "evals", "unsupported.yaml"),
      readFileSync(join(root, CANDIDATE, "evals", "unsupported.yaml"), "utf8"),
    );
    const result = validateSkillDir(root, dir);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes("undeclared executable") || e.includes("undeclared execution")),
      result.errors.join("\n"),
    );
  });

  it("secret scanner catches access-key shaped literals", () => {
    const root = tmpRoot();
    writeFileSync(join(root, CANDIDATE, "leaked.txt"), "AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP\n");
    const findings = scanPathForSecrets(join(root, CANDIDATE));
    assert.ok(findings.some((f) => f.includes("aws-access-key")));
  });
});
