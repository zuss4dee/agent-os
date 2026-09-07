# Skill forge (import, review, promote)

Third-party skills are **untrusted** until a human review says otherwise. Discovery is not approval.

## Lifecycle

```
DISCOVERED → IMPORTED → REVIEW → ADAPTED → EVALUATED → APPROVED → PRODUCTION → DEPRECATED
```

Map onto disk:

- `lab/skill-experiments/` — scratch
- `skills/candidates/<id>/<ver>/` — imported/adapted/evaluated
- `skills/production/<id>/<ver>/` — approved and gated
- `skills/deprecated/<id>/<ver>/` — still resolvable for old pins

## Import record

For anything not originated in this repo, set `origin.type: third-party` and fill:

- source_url, author, imported_at, license, original_version, original_id
- runtime.type and code_paths if any code exists
- permissions.network / filesystem / execution / destructive
- requirements.connectors, credentials (names only), dependencies
- status.reviewer, review_status (`unreviewed` until someone owns it)
- trusted: false

Do not execute bundled scripts as part of import. Do not store API keys.

## Review checklist

1. Is this markdown-only, or does it ship code?
2. Does the manifest match the files (no hidden `.py` / `.sh`)?
3. Network, filesystem, execution, destructive: declared and justified?
4. License compatible with this fleet?
5. Eval cases exist for the claims the skill makes?
6. Can it be adapted to Agent OS voice without becoming a second identity prompt?

## Promote

Production requires `evaluation.score` and `evaluation.last_evaluated_at`. Move the version directory to `skills/production/`, set `lifecycle: production`, record `artifact_hash` in `registry/skills.yaml`, then bump agent pins separately.
