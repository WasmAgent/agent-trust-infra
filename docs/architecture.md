# Architecture Overview

## Trust artifact chain

```
wasmagent-js runtime
  CapabilityManifest
  MCP firewall events
  AEP evidence
        ↓
agent-trust-infra
  AgentBOM (composition snapshot)
  MCP Posture (permission attack surface)
        ↓
open-agent-audit
  Evidence validation
  Audit report generation
  Framework mapping
        ↓
Trust Passport
  Signed trust-state summary
  Validity period + renewal triggers
  Evidence hash references
        ↓
trustavo.com/passport
  Issuance, verification, renewal, revocation
```

## Component responsibilities

### AgentBOM

Describes the deployed composition of an agent: model layer, tool layer, prompt layer, permission layer, evidence references, and known risk signals.

Input to: audit reports, posture analysis, procurement review, Trust Passport issuance.

### MCP Posture

Describes the permission attack surface of an MCP-connected agent: connected servers, exposed tools, permission scopes, risk taxonomy mapping, and posture drift.

Runtime scanning primitives: `wasmagent-js`.
Posture state, reporting, and audit integration: `open-agent-audit / Trustavo`.

### Trust Passport

A signed, expiring trust-state artifact that summarizes evidence quality, open risks, audit references, validity period, and revocation triggers.

Incubated here as specification and prototype. Intended product home: `open-agent-audit / Trustavo`.

## Data flow

```
Runtime facts (wasmagent-js)
        ↓ generate
AgentBOM JSON + MCP Posture JSON
        ↓ validate
agent-trust CLI
        ↓ reference
Audit report (open-agent-audit)
        ↓ summarize
Trust Passport JSON
        ↓ issue / verify
Trustavo
```
