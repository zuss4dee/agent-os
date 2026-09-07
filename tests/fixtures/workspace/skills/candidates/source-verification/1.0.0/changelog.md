# Changelog

Every entry must include what changed, why, evidence/reason, expected behavior change, evaluation impact, and rollback path.

## Unreleased

### 1.0.0 — fixture

- What changed: initial instruction-only source verification skill.
- Why: compiler/validator acceptance fixture.
- Evidence/reason: architecture acceptance test.
- Expected behavior change: agents pinning this skill must label unverified facts.
- Evaluation impact: suite `evals/` is the gate for this pin.
- Rollback path: remove the pin from the agent; delete this version directory.
