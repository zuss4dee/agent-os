# Working in Agent OS

This repository is a **control plane**, not a prompt dump.

## Layers

Keep these separate in every change:

1. Source of truth (files in git)
2. Compiled packets (hashes, versions, commit)
3. Runtime loading (future MCP/loader)
4. Evaluation (suites here; execution elsewhere)
5. Release (promotion, pins, rollback)

## Do

- Pin skills as `id@version` in the agent manifest only. Register them.
- Put shared rules in `shared/`.
- Put experiments in `lab/`.
- Declare skill permissions honestly. Trust is explicit.
- Treat third-party skills as untrusted until review.
- Production agents pin production skills only.

## Do not

- Invent an xAI API that rewrites Grok Bot profiles.
- Commit secrets.
- Promote to `skills/production/` without evaluation metadata.
- Silently fix invalid manifests; fail validation instead.
- Add fake integrations or placeholder production agents.

## Commands

```bash
npm install
npm test
./scripts/validate-agent <id>
./scripts/validate-skill <id@version>
./scripts/compile-agent <id>
```

## PR bar

Validation must pass. Contract hashes in compiled packets must be reproducible from the same tree. No credentials.
