# Trust Passport v0.1 Specification

> Status: experimental draft. Subject to change.

## What is a Trust Passport?

A Trust Passport is a signed trust-state artifact for an AI agent.

It summarizes evidence quality, open risks, audit references, validity period, renewal triggers, and revocation triggers.

It supports technical due diligence, procurement review, and internal governance workflows.

Trust Passport is not a legal certification, security certification, or ISO/EU AI Act compliance attestation.

## Trust Passport answers

- When was this agent last audited?
- What is the audit report hash?
- What is the AgentBOM hash?
- Are there open risks?
- What is the evidence quality?
- Which frameworks have selected technical evidence support?
- When does this passport expire?
- What changes trigger renewal?
- Has this passport been revoked?

## Validity model

A Trust Passport has a validity period defined at issuance. The default validity period is 90 days.

### Renewal triggers

A passport should be renewed when any of the following occur before expiry:

- AgentBOM changes (new tools, permission changes, model update)
- New high or critical risk finding
- MCP posture drift detected
- Audit report updated
- Deployment context changes

### Revocation triggers

A passport is revoked when:

- Critical security finding is discovered after issuance
- Evidence is found to be falsified
- Agent is decommissioned
- Issuer determines the trust state is no longer valid

## Schema structure

```
TrustPassport v0.1
├── identity         — passport ID, agent ID, issuance context
├── agentbom_ref     — hash reference to AgentBOM
├── audit_ref        — hash reference to audit report
├── posture_ref      — hash reference to MCP posture snapshot
├── evidence_summary — evidence quality and framework mapping
├── risk_summary     — open risk count by severity
├── validity         — issued_at, expires_at, renewal triggers
├── revocation       — revoked flag, revocation triggers
└── attestation      — issuer, signature
```

## CLI commands

```bash
agent-trust passport validate <path>    # Validate against schema
agent-trust passport inspect <path>     # Human-readable summary
```

## Future product home

Trust Passport will be productized in `open-agent-audit / Trustavo` at `trustavo.com/passport` once the schema and workflow stabilize.

Future CLI (in open-agent-audit):
```bash
open-agent-audit passport issue --report audit-report.json --agentbom agentbom.json --out trust-passport.json
open-agent-audit passport verify trust-passport.json
```
