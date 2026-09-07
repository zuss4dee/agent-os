import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEvalSuite } from "./changelog.ts";
import { findSkill, findAgentRecord } from "./registry.ts";
import { validateAgentDir } from "./validate-agent.ts";
import { ValidationFailed } from "./errors.ts";
import { SKILL_PIN } from "./semver.ts";

export type EvaluationReport = {
  target: string;
  suite: string;
  cases: Array<{ id: string; task: string }>;
  executed: false;
  reason: string;
};

export function evaluateTarget(repoRoot: string, targetId: string): EvaluationReport {
  const agentDir = join(repoRoot, "agents", targetId);
  if (existsSync(join(agentDir, "manifest.yaml"))) {
    const agent = validateAgentDir(repoRoot, agentDir);
    if (!agent.ok || !agent.manifest) {
      throw new ValidationFailed(`agent ${targetId}`, agent.errors);
    }
    const suite = join(agentDir, agent.manifest.evaluation.suite);
    const { cases, errors } = loadEvalSuite(repoRoot, suite);
    if (errors.length) throw new ValidationFailed(`evals for ${targetId}`, errors);
    return report(`agent ${targetId}`, suite, cases);
  }

  const registered = findAgentRecord(repoRoot, targetId);
  if (!registered.error && registered.record) {
    throw new ValidationFailed(targetId, [`registered agent ${targetId} is missing on disk at ${registered.record.path}`]);
  }

  if (!SKILL_PIN.test(targetId)) {
    throw new ValidationFailed(targetId, [
      `cannot evaluate "${targetId}": not an agent id, and skill evaluation requires an explicit id@version (no default version)`,
    ]);
  }
  const [, id, version] = SKILL_PIN.exec(targetId)!;
  const found = findSkill(repoRoot, id, version);
  if (!found.record) {
    throw new ValidationFailed(targetId, [found.error ?? "skill not registered"]);
  }
  const suite = join(found.record.path, found.record.manifest.evaluation.suite);
  const { cases, errors } = loadEvalSuite(repoRoot, suite);
  if (errors.length) throw new ValidationFailed(`evals for ${targetId}`, errors);
  return report(`skill ${targetId}`, suite, cases);
}

function report(target: string, suite: string, cases: Array<{ id: string; task: string }>): EvaluationReport {
  return {
    target,
    suite,
    cases: cases.map((c) => ({ id: c.id, task: c.task })),
    executed: false,
    reason:
      "No model adapter is configured. Suite structure is valid. Execution requires an explicit evaluator runtime; Agent OS will not invent scores.",
  };
}
