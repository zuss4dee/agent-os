import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.ts";
import { validateAgentDir } from "../src/validate-agent.ts";
import { validateSkillDir } from "../src/validate-skill.ts";

describe("templates in the canonical repo", () => {
  it("validates agents/_template", () => {
    const result = validateAgentDir(REPO_ROOT, join(REPO_ROOT, "agents", "_template"));
    assert.equal(result.ok, true, result.errors.join("\n"));
  });

  it("validates skills/_template as a directory (not indexed)", () => {
    const result = validateSkillDir(REPO_ROOT, join(REPO_ROOT, "skills", "_template"));
    assert.equal(result.ok, true, result.errors.join("\n"));
  });
});
