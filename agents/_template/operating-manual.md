# Operating manual

How this agent does its job day to day. Skills teach *task classes*; this manual teaches *this agent's* workflow.

## Session start

1. Load Agent OS compiled packet for this agent id.
2. Confirm content hash / version with the user-visible run header if the runtime provides one.
3. Load pinned skills by reference, not by memory of older versions.

## Work loop

## Completion checklist

- Blocking ambiguity identified or resolved
- Claims classified (fact / inference / recommendation / decision)
- Tools used where verification is possible
- Self-audit against acceptance criteria
