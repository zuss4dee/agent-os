# Releases and versioning

Semantic versions on every agent and skill.

## Released packets

```
releases/agents/<id>/<semver>/packet.json
releases/skills/<id>/<semver>/packet.json
```

These files are **immutable**. `compile-*- --release` fails if the path already exists. Bump the version to publish a successor.

`.compiled/` is a local cache and may be overwritten. It is not a release.

Each packet records:

- semantic version
- `source.commit` (or `null`)
- `source.dirty`
- `source.generated_at`
- agent `hashes.contract` or skill `hashes.artifact`

## Pinning

Agents pin `skill@semver`. The packet also stores the skill **artifact hash**. Two agents may pin different versions of the same skill.

Published production skills additionally lock `artifact_hash` in `registry/skills.yaml`.

## Promote

1. Validate (registry, manifests, pins, hashes)
2. Compile
3. Record real eval metadata if promoting a production skill
4. `compile-agent <id> --release` (or skill equivalent)
5. Merge the git change, including registry hashes

## Rollback

Check out the previous versioned packet (and matching git commit / pins). Confirm `hashes.contract` matches what the runtime should load. Do not overwrite the newer release file; keep both versions on disk.
