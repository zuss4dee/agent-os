# Runtime

GitHub/git is canonical **source**. The **compiled packet** is the only production runtime contract.

Editing a file in git does not mutate a Grok Bot profile. There is no xAI profile API in this project.

## Production path

```
source → validate → compile → promote/release → load compiled packet → verify hashes → execute
```

### Loader interface (not implemented)

| Method | Purpose |
| --- | --- |
| `get_compiled_packet(agent_id, version)` | Released packet; production entrypoint |
| `load_skill(id, version, expected_hash)` | Skill artifact iff hash matches |
| `verify_hash(kind, id, version, expected)` | Refuse stale artifacts |
| `list_agent_skills(agent_id)` | Pins + artifact hashes from the packet |

Do **not** use `get_agent_manifest` or raw GitHub file fetch as a production execution path. Manifests are for authors and CI.

`load_skill` without `expected_hash` is non-compliant.

### Stale detection

If cached `hashes.contract` ≠ packet `hashes.contract`, reload. If a skill’s live artifact hash ≠ `skills[].artifact_hash`, refuse that skill.

## Non-production (dev/research)

Reading source files from a working tree is allowed for humans and for `validate-*` / `compile-*`. It is **not** an equivalent production runtime.

## Grok

- **Mode A (non-production):** Bot + GitHub connector fetching files. Weaker; not the control-plane contract.
- **Mode B (intended):** Runtime + Agent OS loader serving **released packets** only. Grok profile can be a pointer: load packet `<agent>@<version>` before work.

Do not implement MCP/HTTP in this repository until a real transport exists.
