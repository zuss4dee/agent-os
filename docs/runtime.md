# Runtime

The production runtime loader is a **security boundary**. It turns a versioned, immutable compiled Agent OS release packet into a verified `RuntimeContext`.

GitHub/git is canonical **source**. The **compiled packet** is the only production runtime contract.

Nothing becomes executable merely because it exists on disk. An artifact becomes loadable only after:

identity verified + version verified + schema verified + hash verified + registry resolution verified + lifecycle/trust verified + capability/permission envelope verified.

## What this is not

Hash verification, schema validation, lifecycle validation, and permission checks are **integrity and control** mechanisms.

This runtime is **not a sandbox**. It does not isolate processes, contain filesystem/network access, or execute tools. Isolation belongs in a future capability gateway / execution layer.

`RuntimeContext.isolation` is always `"none"`.

## Architecture

```
source
  → validate
  → compile
  → release packet
  → runtime load
  → verify identity / version / hash / permissions
  → construct RuntimeContext
  → execute only through declared capabilities
```

Production never loads arbitrary raw agent files or arbitrary skills from the working tree.

`RuntimeContext` references immutable verified artifacts (release path, contract hash, skill ids/versions/artifact hashes, declared tools/connectors, permission envelope, provenance). It does not embed mutable source files or `SKILL.md`.

## Production loading sequence

`loadAgentRelease(agentId, version)` with `mode: "production"` (the default):

1. Require an exact `id` + full semver. Reject `@latest`, missing versions, and incomplete versions such as `1.0`.
2. Resolve the **agent** through `registry/agents.yaml`. Filesystem presence is not membership.
3. Load **only** `releases/agents/<id>/<version>/packet.json`. `.compiled/` is ignored in production.
4. Validate the packet against `compiled-agent.schema.json` and packet invariants.
5. Recompute `hashes.contract`. If it disagrees with the packet (or `runtime.stale_check.contract_hash`), **reject**.
6. Require agent `status: production`.
7. Resolve every packet skill by **exact** `id@version` in `registry/skills.yaml`. No directory search, no substitute version.
8. Recompute each skill **artifact hash** from the registered path. Compare packet hash, live hash, and published registry `artifact_hash`.
9. Enforce the existing production trust contract: registered, `lifecycle: production`, explicit `trusted: true`.
10. Compare packet vs live permission envelope, tools, and connectors. Do not expand permissions.
11. Reject unknown tools (empty `registry/tools.yaml` means **no** tools).
12. Return a frozen `RuntimeContext` or **fail closed**.

The loader does not silently repair, fall back to another version, select “latest”, load HEAD, or discover substitutes on disk.

## Immutable release model

If `releases/agents/<agent>/<version>/packet.json` exists, that identity is locked. A modified packet with the same identity, a changed skill source with the same version, changed permissions/tools/connectors, or a changed agent contract with the same version **must fail** verification when content no longer matches the recorded hashes.

Bump the version to publish a successor. Do not overwrite a release.

## Hash verification

| Hash | Role |
| --- | --- |
| Agent **contract hash** | Identity files, instructions, shared policies, skill refs (including artifact hashes and envelopes), tools, knowledge, loader/sync |
| Skill **artifact hash** | Entrypoint bytes, runtime type, permission envelope, tools/connectors, origin type, explicit `trusted` |

Evals, changelog, and references are not runtime hashes.

## Registry resolution

`claim-check@1.0.0` resolves only to registry id `claim-check` version `1.0.0`, then the recorded `artifact_hash` is verified.

Not allowed: `claim-check@latest`, `claim-check@1.0`, current HEAD, or “some other matching directory”.

An extra skill directory that is not in the registry is invisible to the loader.

## Trust / lifecycle

Production reuses `productionAgentMayPin` and explicit `status.trusted`. It does not infer trust from `origin: internal`.

Rejected in production: candidate/lab/fixture skills, unregistered skills, deprecated skills, untrusted skills.

## Permission envelope

The envelope is executable **policy** for a future gateway, not a sandbox:

- allowed tools
- allowed connectors
- network / filesystem / execution / destructive

The loader never silently expands permissions. If a skill’s live envelope disagrees with the packet, load fails. If a runtime invocation requests a capability the verified context did not declare, the gateway rejects it.

## Capability gateway boundary

Types: `CapabilityRequest`, `CapabilityDecision`, `CapabilityGateway`.

Intended chain:

agent declared capability → skill declared capability → permission envelope → requested operation

`decideCapability` / `executeCapability` enforce the envelope. Allowed requests then throw `Capability execution is not implemented`. They do not pretend execution occurred.

## Modes

| Mode | Packet source | Rules |
| --- | --- | --- |
| **production** | `releases/` only | Production agent; production trusted skills; full hash/registry/envelope checks |
| **development** | `.compiled/` if present, else release | Diagnostics and development artifacts; production agents still cannot pin non-production skills; **never** reported as production |
| **lab** | same as development | May load fixture/candidate pins; **never** reported as production |

Development and lab must not masquerade as production. Production rules are not weakened to make local work easier.

## Failure-closed errors

Structured errors include: `ReleaseNotFound`, `ReleaseSchemaInvalid`, `ReleaseHashMismatch`, `AgentContractMismatch`, `SkillNotFound`, `SkillVersionMismatch`, `SkillArtifactHashMismatch`, `SkillNotTrusted`, `SkillNotProduction`, `CapabilityNotDeclared`, `PermissionDenied`, `RegistryResolutionError`, `ImplicitVersionError`, `EnvelopeMismatch`.

Verification failures are not caught and returned as a valid context.

## CLI

```bash
./scripts/load <agent>@<version>
./scripts/agent-os load <agent>@<version> --mode production
```

Prints agent, version, release path, contract hash, loaded skills and artifact hashes, permissions, tools, connectors, and verification result. Failures print the exact reason. Output must not include secrets.

## What the runtime does not yet do

- MCP
- Grok Bot / xAI API integration
- HTTP server, auth, deployment, queues, workers
- Tool execution, browser automation
- Secrets manager
- Sandbox or container isolation

Those layers come after this contract is proven.

## Grok (future)

- **Mode A (non-production):** Bot + GitHub connector fetching files. Weaker; not the control-plane contract.
- **Mode B (intended):** This loader serving **released packets** only. A Grok profile can point at `load <agent>@<version>` before work.

Do not implement MCP/HTTP here until a real transport exists. Do not invent unsupported xAI APIs.
