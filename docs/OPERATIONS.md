# Patrol Operations

> **Status:** Reference — standard operating procedure for patrol findings.
> This document defines the patrol workflow, confidence thresholds, and runbook
> for responding to automated patrol findings in this repository.

## Patrol Workflow

The patrol daemon scans the repository for predefined risk patterns and files
issues with structured metadata. Each patrol finding follows the lifecycle
below:

```
Patrol Daemon scan
        ↓
Issue filed (with `<!-- patrol: ... -->` flags and confidence score)
        ↓
Human review (SME triage)
        ↓
Decision: Accept / Reject / Escalate
        ↓
Action (fix merged, issue closed, or runbook invoked)
```

### Steps in detail

1. **Daemon scans** — The patrol bot runs on a schedule or trigger and analyzes
   repository content (code, docs, configuration) against patrol rules.
2. **Issue filed** — A GitHub issue is created with:
   - A `<!-- confidence: N.N -->` tag indicating the patrol's confidence in the
     finding (0.0–1.0).
   - A `<!-- patrol: <category> -->` tag identifying the patrol category (e.g.,
     `code-review`, `security`, `compliance`).
   - A structured body with the finding description, evidence, and suggested
     remediation.
3. **Human review** — A subject-matter expert (SME) reviews the issue, assesses
   the finding, and may request additional evidence or clarification.
4. **Decision** — The reviewer records a decision:
   - **Accept** — The finding is valid; the fix is merged or a tracking issue
     is created.
   - **Reject** — The finding is a false positive; the issue is closed with
     rationale.
   - **Escalate** — The finding requires broader input; it is escalated to the
     maintainers or security team.
5. **Action** — The decision is executed: a PR is merged, a follow-up issue is
   filed, or the runbook is triggered.

## Confidence Thresholds

Patrol findings include a `<!-- confidence: N.N -->` tag. The confidence score
determines how the finding is handled:

| Confidence range | Handling | Required action |
|---|---|---|
| `>= 0.8` | Autonomous fix allowed | Bot may create a PR with the proposed remediation without waiting for human approval. Human review must still occur before merge. |
| `>= 0.5 and < 0.8` | Requires human review | Issue filed with `Decision:` block. Human must deliberate and record a decision before any fix is applied. |
| `< 0.5` | Informational | Issue filed for awareness. No action required; may be closed or used for trend analysis. |

### Decision block

For findings below the autonomous threshold (`< 0.8`), the issue must contain a
`Decision:` block where the reviewer records their disposition:

```markdown
## Decision

- **Verdict:** Accept / Reject / Escalate
- **Reviewer:** <name or handle>
- **Date:** <date>
- **Rationale:** <one-paragraph explanation>
```

## Runbook

> **Note:** This section will be expanded as incident response procedures are
> defined. Until then, use the following placeholder guidance.

If a patrol finding is detected:

1. **Check the daemon logs** — Review the patrol daemon output for the scan
   that produced the finding. Logs are emitted to the daemon's configured
   output stream (see deployment configuration).
2. **Validate the finding** — Confirm that the evidence cited in the issue is
   accurate and that the finding represents a real risk or violation.
3. **Triage by severity** — Use the patrol category and confidence score to
   prioritize:
   - `security` or `compliance` findings should be reviewed within 1 business
     day.
   - `code-review` findings should be reviewed within 3 business days.
4. **Apply the fix or close** — If the finding is valid, apply the suggested
   remediation (or a variant thereof). If it is a false positive, close the
   issue with a clear rationale.
5. **Update the runbook** — If this finding type recurs, document the response
   pattern here.

### Incident response contact

- **Security findings:** Open a security advisory or contact the maintainers
  via the repository's security policy.
- **Operational findings:** File a follow-up issue or reach out in the
  repository's discussions.

## Patrol categories

| Tag | Description |
|---|---|
| `patrol: code-review` | Code quality, correctness, or maintainability finding |
| `patrol: security` | Security vulnerability or misconfiguration |
| `patrol: compliance` | Compliance or policy violation |
| `patrol: operations` | Operational risk or runbook gap |

## Related

- [Contributing guide](../CONTRIBUTING.md) — how to contribute and respond to
  patrol tags
- [Compliance profile authoring guide](compliance.md) — custom compliance
  profiles for patrol rules
