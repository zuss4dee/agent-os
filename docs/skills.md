# Skills

A skill teaches **how to perform a class of work**. It is not identity, not a tool, and not a knowledge base.

## Prompt vs skill vs tool vs knowledge vs routine vs eval

- **Prompt** — who the agent is and how it behaves generally.
- **Skill** — the procedure, decision rules, and output contract for one class of tasks.
- **Tool** — an external action surface (API, MCP connector). Skills may *require* tools; they are not tools.
- **Knowledge** — documents the agent may retrieve. Skills may *cite* knowledge; they are not dumps of facts.
- **Routine** — a triggered sequence (schedule, webhook, multi-agent). Not a skill.
- **Eval** — how we tell the skill or agent still behaves.

## Layout

```
skills/<lifecycle>/<id>/<semver>/
  SKILL.md
  manifest.yaml
  references/
  examples/good/
  examples/bad/
  evals/
  changelog.md
```

Lifecycle directories: `candidates`, `production`, `deprecated`.

`skills/candidates/` is a **disk bucket** for pre-production work. Manifest `status.lifecycle` must match the bucket:

- `skills/candidates/` — discovered, imported, review, adapted, evaluated, approved, fixture
- `skills/production/` — production only
- `skills/deprecated/` — deprecated only

Resolution uses `registry/skills.yaml`. Unregistered skill directories fail catalog validation.

Production skills require `artifact_hash` in the registry. Mutating files under an existing production version fails; bump the version.

`trusted` is explicit in the manifest. It is **never** inferred from `origin: internal`.

## Version pins

Agents pin `id@version` in **manifest.yaml only**. The compiled packet also stores `artifact_hash` and the permission envelope.

## Validation

Fails on missing `SKILL.md`, schema errors, bucket/lifecycle mismatch, unregistered skills, stale published hashes, third-party provenance gaps, undeclared code/network/execution hints, and unknown required tools.

## Manifest concepts

- **origin** — internal vs third-party; URL, author, import date, license, original version.
- **runtime.type** — `instruction` (markdown only), `executable`, or `hybrid`.
- **permissions** — network, filesystem, execution, destructive.
- **requirements** — tools, connectors, credential *names*, dependencies.
- **status.lifecycle** — discovered → imported → review → adapted → evaluated → approved → production → deprecated.
- **trusted** — must stay false for third-party skills until review is approved.

Instruction-only skills must not contain code files. If they do, validation fails as undeclared executable behavior.
