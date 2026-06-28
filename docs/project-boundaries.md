# Project Boundaries

This document defines what belongs in this repository and what belongs elsewhere.

## What belongs here

- Early-stage specifications
- JSON schemas
- Reference prototypes
- Cross-project architecture notes
- Demo fixtures
- Integration examples
- Technical reports
- Design notes
- Decision logs

## What does not belong here

- Trustavo production SaaS backend
- Production passport issuance and verification service
- `open-agent-audit` stable audit engine
- `wasmagent-js` runtime code
- Private customer data
- Private deployment secrets
- Private enterprise configurations

## Boundary table

| Repository | Role |
|---|---|
| `agent-trust-infra` | Exploration, incubation, specs, prototypes, demos |
| `wasmagent-js` | Runtime primitives, MCP firewall, AEP emitter, CapabilityManifest |
| `open-agent-audit / Trustavo` | Audit reports, framework mapping, Trust Passport productization |
| `agentbom` (future) | Stable public AgentBOM spec, schema, reference examples |
| `mcp-posture` (future, optional) | Standalone MCP security product if demand appears |

## This repository does not define the delivery backlog for open-agent-audit

`open-agent-audit` remains focused on:

- Evidence validation
- Canonical evidence conversion
- Audit report generation
- Selected framework mapping
- Cloudflare-native deployment
- Trustavo audit service

This repository explores future trust artifacts. Future integration may be scoped separately once the artifacts stabilize.

Trust Passport is expected to become a Trustavo product module only after its schema, validity model, renewal triggers, and revocation model are stable.

MCP Posture may feed Trustavo dashboards and reports in the future, but runtime scanning primitives should be owned by `wasmagent-js`.

AgentBOM may become a standalone specification repository if the schema stabilizes and external adoption or standardization needs emerge.
