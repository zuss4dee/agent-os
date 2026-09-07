# Architecture

Agent OS is a **control plane**. Git is the canonical store. Production runtimes load **compiled packets**, not raw source files.

## Layers

```
SOURCE (git)
  → VALIDATE (registry + manifests + pins)
  → COMPILE (packet + hashes)
  → PROMOTE / RELEASE (immutable versioned artifact)
  → LOAD (compiled packet only)
  → VERIFY (contract hash + skill artifact hashes)
  → EXECUTE
```

Do not collapse these layers into “the prompt file.”

### 1. Source of truth

`agents/`, `skills/`, `shared/`, `registry/`, `schemas/`. A change is real only when it is in git.

The **registry** is the catalog used for resolution. Filesystem presence is not membership.

### 2. Compiled configuration

`compile-agent` / `compile-skill` produce packets. Production consumers must use a **released** packet under `releases/<kind>/<id>/<version>/packet.json`. `.compiled/` is a disposable local cache.

Packets **reference** skills (id, version, artifact hash, permission envelope). They do not inline `SKILL.md`.

### 3. Runtime loading

A future loader asks for `get_compiled_packet(agent_id, version)` and `load_skill(id, version, expected_hash)`. Mismatched hashes are refused. See [runtime.md](runtime.md).

### 4. Evaluation

Eval YAML describes behavior. `evaluate` checks suite structure and never invents skill versions or scores.

### 5. Release

Released packets are immutable. Bump the version to publish again.

## Hash model

Two hashes matter at runtime:

| Hash | Identifies | Includes | Excludes |
| --- | --- | --- | --- |
| **Skill artifact hash** | Exact skill pin `id@version` | Entrypoint bytes, runtime type, permissions (network/filesystem/execution/destructive), required tools/connectors, origin type, explicit `trusted` | evals, examples, changelog, references |
| **Agent contract hash** | Exact compiled agent | Identity files, system + operating manual, applied shared policies, skill refs (including artifact hashes and permission envelopes), agent tools, knowledge hashes, loader/sync | eval case bodies, changelog, `generated_at` |

`prompt_hash` is not a contract. Do not treat it as one.

A loader must reject a skill whose live artifact hash ≠ the packet’s `skills[].artifact_hash`.

Production and deprecated skills also store `artifact_hash` in `registry/skills.yaml`. Editing that version’s files without a bump fails validation.

## Object model

```
agent = identity + operating contract + skill pins + tool ids + knowledge + evals + version
skill = procedure + permission envelope + origin + evals + version
tool = registered external capability
knowledge = retrievable material (runtime)
routine = future automation (not in the packet yet)
eval = behavioral specification (not a runtime input)
```

## Traceability

For any production run: agent version, skill pins, skill artifact hashes, git commit, contract hash.
