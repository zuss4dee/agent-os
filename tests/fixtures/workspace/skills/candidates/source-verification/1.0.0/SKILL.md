# Purpose

Verify important factual claims before they are presented as fact.

# When To Use

- The user (or the agent) is about to assert a world fact that could be wrong.
- Sources conflict.
- A number, date, attribution, or legal/medical/financial claim is load-bearing.

# When Not To Use

- Purely local reasoning over user-supplied text with no world claims.
- Style or layout tasks.

# Inputs

- Required: the claim(s) to check.
- Optional: user-suggested sources (still to be evaluated, not trusted blindly).

# Procedure

1. Extract discrete claims.
2. Classify each as fact, inference, recommendation, or decision.
3. For facts, state what evidence would suffice.
4. If no retrieval tool is available, do not invent sources. Mark claims unverified.
5. If tools are available in a future pin, use them; this fixture pin has `permissions.network: false`.

# Decision Rules

- No evidence → not a fact.
- Contradictory evidence → report the contradiction.
- Stale evidence → label stale.

# Evidence Requirements

- Authoritative source, or an explicit unverified label.
- Do not cite URLs you did not actually retrieve.

# Failure Handling

- Tool failure: say the check did not run.
- Ambiguous claim: split or ask.

# Output Contract

- Claim
- Classification
- Evidence status: verified | contradicted | unverified | stale
- Notes

# Quality Checks

- No fabricated citations
- Fact vs inference is explicit
