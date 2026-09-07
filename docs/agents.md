# Agents

An agent is not a prompt. It is a versioned operating package.

## Required files

| File | Role |
| --- | --- |
| `manifest.yaml` | Identity, **canonical skill pins**, runtime, eval pointer, status |
| `profile.md` | Who |
| `system.md` | Operating contract |
| `operating-manual.md` | This agent's workflow |
| `knowledge/` | Retrievable agent-specific material |
| `references/` | Source docs in scope |
| `examples/good`, `examples/bad` | Trajectory illustrations |
| `evals/` | Behavior suite |
| `changelog.md` | What/why/expected/eval/rollback |

Copy `agents/_template/` to `agents/<id>/`. The directory name must equal `manifest.id`.

## Manifest

Skills are pins, not copies:

```yaml
skills:
  - source-verification@1.0.0
```

Equivalent object form: `{ id: source-verification, version: 1.0.0 }`.

`runtime.loader` should be `agent-os` until another loader exists. `sync` is `on-session-start`, `on-demand`, or `pinned-release`.

`metadata.status`: `draft | candidate | production | deprecated | fixture`.

Production agents may pin **only** registered skills with `lifecycle: production`. Register the agent in `registry/agents.yaml` before validation.

## Shared policies

Unless `shared_policies` is set, compile includes the default set under `shared/`. Production agents cannot use an empty list and must include `principles.md` and `safety.md`.

## Validation

Fails closed on unregistered skills/agents, unknown tools (empty tool registry allows none), production pin policy, stale published hashes, and missing eval YAML.

## Compile

`compile-agent <id>` writes `.compiled/` (cache). `compile-agent <id> --release` writes `releases/agents/<id>/<version>/packet.json` and will not overwrite.
