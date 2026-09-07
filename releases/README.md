# Releases

Promoted compiled packets:

```
releases/agents/<id>/<semver>/packet.json
releases/skills/<id>/<semver>/packet.json
```

These paths are immutable. Use `compile-* --release`. If the file exists, bump the version.

`.compiled/` is a local cache, not a release.

Runtime compares `hashes.contract` (agents) or `hashes.artifact` (skills) plus each skill pin's `artifact_hash`.
