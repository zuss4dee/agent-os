import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "./paths.ts";
import { validateAgentDir, listAgentIds } from "./validate-agent.ts";
import { validateSkillDir } from "./validate-skill.ts";
import { compileAgent, compileSkill } from "./compile.ts";
import { diffAgent, diffSkill } from "./diff.ts";
import { evaluateTarget } from "./evaluate.ts";
import { ValidationFailed } from "./errors.ts";
import { findSkill, validateCatalog } from "./registry.ts";
import { SKILL_PIN } from "./semver.ts";

function usage(): string {
  return `agent-os — control plane CLI

Usage:
  agent-os validate-agent <id>
  agent-os validate-skill <id@version>
  agent-os compile-agent <id> [--release]
  agent-os compile-skill <id@version> [--release]
  agent-os diff-agent <id>
  agent-os diff-skill <id@version>
  agent-os evaluate <agent-id|skill-id@version>
  agent-os validate-catalog

Options:
  --root <path>   Repository root (default: detect)
  --release       Write an immutable versioned packet under releases/
  --json          Machine-readable output
`;
}

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let root: string | undefined;
  let json = false;
  let release = false;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--root") {
      root = args[++i];
    } else if (a === "--json") {
      json = true;
    } else if (a === "--release") {
      release = true;
    } else if (a === "-h" || a === "--help") {
      console.log(usage());
      process.exit(0);
    } else if (a.startsWith("-")) {
      fail(`Unknown option ${a}\n${usage()}`);
    } else {
      positional.push(a);
    }
  }
  return { root: root ?? findRepoRoot(), json, release, command: positional[0], target: positional[1] };
}

function printValidation(title: string, result: { ok: boolean; errors: string[]; warnings: string[] }, json: boolean) {
  if (json) {
    console.log(JSON.stringify({ title, ...result }, null, 2));
  } else {
    if (result.warnings.length) {
      console.warn(`Warnings for ${title}:`);
      for (const w of result.warnings) console.warn(`  ! ${w}`);
    }
    if (!result.ok) {
      console.error(`FAIL ${title}`);
      for (const e of result.errors) console.error(`  - ${e}`);
    } else {
      console.log(`OK ${title}`);
    }
  }
  if (!result.ok) process.exit(1);
}

function resolveSkillDir(root: string, target: string): { dir: string; id: string; version: string } {
  if (!SKILL_PIN.test(target)) {
    fail(`validate/compile skill requires id@version; got "${target}"`);
  }
  const [, id, version] = SKILL_PIN.exec(target)!;
  const found = findSkill(root, id, version);
  if (!found.record) fail(found.error ?? "not registered");
  return { dir: found.record.path, id, version };
}

export async function main(argv = process.argv): Promise<void> {
  const { root, json, release, command, target } = parseArgs(argv);
  if (!command) fail(usage(), 2);

  try {
    switch (command) {
      case "validate-catalog": {
        const errors = validateCatalog(root);
        printValidation("catalog", { ok: errors.length === 0, errors, warnings: [] }, json);
        break;
      }
      case "validate-agent": {
        if (!target) fail("validate-agent requires <id>");
        const result = validateAgentDir(root, join(root, "agents", target));
        printValidation(`agent ${target}`, result, json);
        break;
      }
      case "validate-skill": {
        if (!target) fail("validate-skill requires <id@version>");
        const resolved = resolveSkillDir(root, target);
        const result = validateSkillDir(root, resolved.dir);
        printValidation(`skill ${target}`, result, json);
        break;
      }
      case "compile-agent": {
        if (!target) fail("compile-agent requires <id>");
        const packet = compileAgent(root, target, { release });
        if (json) console.log(JSON.stringify(packet, null, 2));
        else {
          console.log(`compiled agent ${packet.agent.id}@${packet.agent.version}`);
          console.log(`contract hash: ${packet.hashes.contract}`);
          console.log(`commit:        ${packet.source.commit ?? "none"}`);
          console.log(`skills:        ${packet.skills.map((s) => `${s.pin}#${s.artifact_hash.slice(0, 12)}`).join(", ") || "(none)"}`);
        }
        break;
      }
      case "compile-skill": {
        if (!target) fail("compile-skill requires <id@version>");
        const resolved = resolveSkillDir(root, target);
        const packet = compileSkill(root, resolved.id, resolved.version, { release });
        if (json) console.log(JSON.stringify(packet, null, 2));
        else {
          console.log(`compiled skill ${packet.skill.id}@${packet.skill.version}`);
          console.log(`artifact hash: ${packet.hashes.artifact}`);
          console.log(`commit:        ${packet.source.commit ?? "none"}`);
        }
        break;
      }
      case "diff-agent": {
        if (!target) fail("diff-agent requires <id>");
        const diff = diffAgent(root, target);
        if (json) console.log(JSON.stringify(diff, null, 2));
        else {
          console.log(diff.target);
          for (const line of diff.details) console.log(`  ${line}`);
        }
        break;
      }
      case "diff-skill": {
        if (!target) fail("diff-skill requires <id@version>");
        const resolved = resolveSkillDir(root, target);
        const diff = diffSkill(root, resolved.id, resolved.version);
        if (json) console.log(JSON.stringify(diff, null, 2));
        else {
          console.log(diff.target);
          for (const line of diff.details) console.log(`  ${line}`);
        }
        break;
      }
      case "evaluate": {
        if (!target) fail("evaluate requires <agent-id|skill-id@version>");
        const report = evaluateTarget(root, target);
        if (json) console.log(JSON.stringify(report, null, 2));
        else {
          console.log(`Evaluation target: ${report.target}`);
          console.log(`Suite: ${report.suite}`);
          console.log(`Cases (${report.cases.length}): ${report.cases.map((c) => c.id).join(", ")}`);
          console.log(`Executed: ${report.executed}`);
          console.log(report.reason);
        }
        break;
      }
      case "list-agents": {
        console.log(listAgentIds(root).join("\n") || "(none)");
        break;
      }
      default:
        fail(`Unknown command ${command}\n${usage()}`, 2);
    }
  } catch (err) {
    if (err instanceof ValidationFailed) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  await main();
}
