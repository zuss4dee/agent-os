# Evaluation

Evals specify **behavior**, not golden strings (unless the task is literally exact-format).

## Case shape

Each YAML file in `evals/`:

- `id`
- `task`
- `context` (optional)
- `expected_properties` — what a good trajectory must exhibit
- `failure_conditions` — what makes it a fail even if fluent
- `scoring` — `rubric` or `outcome`, with named weighted criteria

## Examples of properties (not exhaustive)

Source-verification class:

- Finds authoritative sources when tools allow
- Detects contradiction
- Refuses unsupported claims
- Distinguishes fact vs inference
- Marks stale information

Creative/direction class:

- Adheres to supplied references
- Stays consistent across the artifact
- Follows instructions
- Avoids generic output
- Meets a rubric, not a stock aesthetic

## Execution

`./scripts/evaluate <id>` loads and schema-validates the suite. It reports `executed: false` unless a real model adapter is configured. This repo does not ship one. Do not treat a green `evaluate` command as a model pass.

Promotion to production still requires humans to fill `evaluation.score` and `evaluation.last_evaluated_at` after a real run elsewhere (or a future adapter).
