# Agent OS

Agent OS is the **source of truth and control plane** for a fleet of AI agents (primarily Grok Bots). GitHub holds canonical identities, operating contracts, skills, knowledge, evals, and releases. Runtime consumers **load** the current configuration. They do not get updated by the mere act of editing a file in this repository.

There is **no documented public xAI API** that this project depends on to mutate a Grok Bot's built-in profile. Do not invent one.

## Why it exists

Prompt paste-bins do not scale a fleet. Agents need:

- identity and an operating contract
- reusable skills (how to do a class of work)
- tools (what they can call)
- knowledge (what they can retrieve)
- evaluation before promotion
- versions, hashes, and rollbacks
- untrusted third-party skill intake
- a runtime loader that can detect stale instructions

## Architecture (do not blur these layers)

1. **Source of truth** — git (agents, skills, shared policies). The **registry** is the catalog.
2. **Compiled packets** — versions, commit SHA, **contract / artifact hashes**, permission envelopes.
3. **Runtime loading** — load **released packets**, then verify hashes. Not raw GitHub files.
4. **Evaluation** — behavior suites; never invent versions or scores.
5. **Release** — immutable `releases/<kind>/<id>/<version>/packet.json`.

See [docs/architecture.md](docs/architecture.md).

## Conceptual distinctions

| Object | Question it answers |
| --- | --- |
| **Prompt / identity** | Who are you and how should you behave? |
| **Skill** | How do you perform this class of work correctly? |
| **Tool** | What external system can you act through? |
| **Knowledge** | What reference material can you retrieve? |
| **Routine** | What multi-step automation should run, when? |
| **Eval** | How do we know the behavior is still acceptable? |

Skills are **not** copied into each agent. Agents **pin** skill versions (`source-verification@1.0.0`). Two agents may pin different versions of the same skill.

## Layout

```
agents/_template/     agent identity + contract template
skills/production/    approved, versioned skills
skills/candidates/    not production
skills/deprecated/    retired pins still resolvable
skills/_template/
shared/               reusable operating policies (not a mega-prompt)
registry/             indexes of agents, skills, tools
releases/             promoted compiled packets
lab/                  experiments; never silent production
schemas/              JSON Schema for manifests
scripts/              CLI entrypoints
docs/                 architecture and workflows
```

## Commands

Requires Node 20+ and `npm install`.

```bash
./scripts/validate-agent <id>
./scripts/validate-skill <id@version>
./scripts/compile-agent <id>
./scripts/compile-skill <id@version>
./scripts/diff-agent <id>
./scripts/diff-skill <id@version>
./scripts/evaluate <agent-id|skill-id@version>
```

Equivalent: `npx tsx src/cli.ts <command> ...`

Validation **fails loudly**. It does not repair broken configuration.

`evaluate` validates suite structure. It does **not** invent model scores. Execution needs an explicit evaluator adapter (not bundled).

## Create a new agent

1. Copy `agents/_template/` to `agents/<id>/`.
2. Set `id`, `name`, `version` in `manifest.yaml`. Directory name must match `id`.
3. Write `profile.md`, `system.md`, `operating-manual.md`.
4. Pin skills in `manifest.yaml` only (`id@version`). Register those skills first.
5. Add eval cases under `evals/`.
6. Record the change in `changelog.md` (what / why / expected behavior / eval impact / rollback).
7. Add the agent to `registry/agents.yaml`.
8. Run `./scripts/validate-agent <id>` then `./scripts/compile-agent <id>`.
9. Promote with `./scripts/compile-agent <id> --release` (fails if that version already exists).

Do not put experimental prompts in `agents/`. Use `lab/prompt-experiments/`.

## Create a new skill

1. Copy `skills/_template/` to `skills/candidates/<id>/<version>/`.
2. Fill `SKILL.md` and `manifest.yaml`.
3. Declare runtime type, permissions, origin, and risk. Do not infer trust from `origin: internal`.
4. Add eval cases.
5. Register the skill in `registry/skills.yaml`.
6. `./scripts/validate-skill <id@version>` then `./scripts/compile-skill <id@version>`.

Third-party skills stay untrusted until review. See [docs/skill-forge.md](docs/skill-forge.md).

## Promote a skill

`discovered → imported → review → adapted → evaluated → approved → production`

1. Keep it under `skills/candidates/` until evaluation metadata exists.
2. Record reviewer and `review_status`.
3. For production: `evaluation.score` and `evaluation.last_evaluated_at` are required.
4. Move the versioned directory to `skills/production/<id>/<version>/` (`lifecycle: production` only).
5. Record `artifact_hash` from `compile-skill` in `registry/skills.yaml`.
6. Point production agents at the new pin only by explicit manifest edit.

A skill found online **never** becomes production automatically.

## Roll back a release

1. Identify `releases/agents/<id>/<version>/packet.json` (contract hash + commit).
2. Re-pin skills and/or check out that commit.
3. Validate and compile. Confirm `hashes.contract` matches the packet you intend to load.
4. The loader must refuse a skill whose artifact hash ≠ the packet pin.

## Grok integration

GitHub is canonical. A Grok Bot is a **runtime consumer**.

- **Mode A (not production):** Grok Bot + GitHub connector fetching files.
- **Mode B (intended):** Loader serves **released compiled packets**. `get_compiled_packet`, `load_skill(id, version, expected_hash)`.

Editing `system.md` in git does **not** by itself change a Grok Bot's built-in description field.

## What this repo will not do

- Call undocumented xAI profile-mutation APIs
- Store secrets or credentials
- Execute third-party skill code on import
- Treat lab experiments as production
- Inject every skill body into every compiled agent (references + hashes only; runtime retrieves)

## License

Private / unpublished unless a LICENSE file is added.
