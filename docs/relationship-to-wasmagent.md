# Relationship to WasmAgent

## Overview

`agent-trust-infra` is not a standalone research project. It is connected to the WasmAgent runtime and audit ecosystem.

## Dependency map

```
wasmagent-js
 runtime protection, MCP firewall, AEP emitter, CapabilityManifest
        ↓ provides runtime facts
agent-trust-infra
 AgentBOM specs and prototypes
 MCP Posture specs and prototypes
 Trust Passport specs and prototypes
        ↓ provides artifact schemas and validation
open-agent-audit / Trustavo
 evidence validation, audit report, framework mapping
 MCP posture dashboard integration (future)
 Trust Passport issuance and verification (future)
```

## wasmagent-js

`wasmagent-js` provides the runtime substrate that makes Agent Trust Infrastructure possible:

- **CapabilityManifest** — structured description of agent capabilities and boundaries
- **MCP firewall** — enforces tool and network access policies at runtime
- **AEP emitter** — generates Agent Evidence Protocol events for audit consumption
- **Runtime facts** — the ground truth that AgentBOM and MCP Posture are derived from

Future integration: AgentBOM generation primitives and MCP scanning primitives should be contributed back to `wasmagent-js` once they stabilize.

## open-agent-audit / Trustavo

`open-agent-audit` is the audit engine and Trustavo is its product form. Their relationship to `agent-trust-infra`:

- **MCP Posture** findings may feed Trustavo dashboards and reports in the future
- **Trust Passport** will become a Trustavo product module (`trustavo.com/passport`) once the schema and workflow stabilize
- **AgentBOM** may contribute an adapter for enriching audit evidence

## bscode

`bscode` serves as a reference workload for realistic demos. The `examples/bscode-agent/` demo in this repository uses bscode as a concrete agent system to generate AgentBOM and MCP Posture samples.

## trace-pipeline

`trace-pipeline` provides evaluation evidence and data gating. It may contribute evidence references to Trust Passports in the future but does not own the Agent Trust Infrastructure main line.
