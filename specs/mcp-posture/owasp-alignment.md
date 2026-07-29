# MCP Posture ↔ OWASP Agentic Top 10 2026 Alignment

**Standard:** OWASP Agentic Security Initiative (ASI) — Agentic Top 10 2026  
**MCP Posture schema version:** v0.1  
**Status:** Draft for community review  

---

## Overview

The OWASP Agentic Top 10 2026 defines the ten most critical security risks for agentic AI systems interacting with tools and environments through protocols such as MCP. This document cross-references each ASI01–ASI10 risk with the corresponding MCP Posture risk taxonomy categories, schema fields, and mitigation guidance.

---

## ASI01 — Prompt Injection

**OWASP description:** Malicious content in the environment causes an agent to take unintended actions or deviate from its intended purpose.

| MCP Posture field | Alignment |
|---|---|
| `servers[].tools[].risk_categories` | Include `prompt_injection` category for tools that process external text |
| `servers[].tools[].risk_severity` | Rate `high` or `critical` for tools that consume untrusted external content |
| `risk_summary.top_risks` | Surface `prompt_injection` findings in the risk summary |
| `servers[].session_model` | Stateless handle model reduces cross-session injection surface |

**Detection approach:** Flag any tool that accepts text from external sources without explicit sanitization policy as a `prompt_injection` risk.

---

## ASI02 — Excessive Agency

**OWASP description:** An agent takes actions beyond what is necessary for the task, including using overly broad permissions or invoking unnecessary tools.

| MCP Posture field | Alignment |
|---|---|
| `servers[].tools[].permissions` | Enumerate all permissions per tool; broad permissions flag this risk |
| `permission_graph` | Graph view of effective permission scope across all servers |
| `servers[].tools[].risk_categories` | Include `privilege_escalation` for tools with broad permission scopes |
| `risk_summary.unmitigated_critical_count` | Zero unmitigated critical permissions required |

**Detection approach:** Any tool with permissions containing `unrestricted` modifier is automatically flagged `privilege_escalation`.

---

## ASI03 — Insufficient Logging and Monitoring

**OWASP description:** The agent does not adequately log or monitor its actions, making it difficult to detect, investigate, or audit anomalous behavior.

| MCP Posture field | Alignment |
|---|---|
| `attestation.signature` | Signed snapshot ensures the posture capture event is auditable |
| `attestation.valid_from`, `attestation.expires_at` | Timestamped posture with expiry enforces freshness |
| `identity.captured_at` | Capture timestamp is mandatory for any valid posture |
| `identity.previous_snapshot_id` | Chain of snapshots provides audit trail |

**Detection approach:** Postures without `attestation.signature` or with expired `valid_from` windows indicate insufficient capture integrity.

---

## ASI04 — Data and Model Poisoning

**OWASP description:** Malicious data injected into training sets, fine-tuning pipelines, or RAG indexes causes the model to behave adversarially.

| MCP Posture field | Alignment |
|---|---|
| `servers[].provenance` | Track the source and integrity hash of each MCP server |
| `servers[].tools[].risk_categories` | Include `supply_chain` for tools that access training data, RAG, or vector stores |
| `servers[].version` | Version pinning prevents silent server-side updates that could introduce poisoned tools |

**Detection approach:** Tools sourced from `unverified-external` or `unknown` provenance trigger `supply_chain` risk.

---

## ASI05 — Improper Output Handling

**OWASP description:** Agent outputs are not properly validated or sanitized before being passed to downstream systems, leading to injection or data leakage.

| MCP Posture field | Alignment |
|---|---|
| `servers[].tools[].risk_categories` | Include `exfiltration` for tools that produce outputs consumable by external systems |
| `servers[].tools[].risk_severity` | Rate `high` for tools that output structured data to downstream systems without validation |
| `risk_summary` | Exfiltration risk count should be explicitly surfaced |

**Detection approach:** Tools with network write permissions and no stated output sanitization policy are `exfiltration` risks.

---

## ASI06 — Sensitive Information Disclosure

**OWASP description:** The agent inadvertently reveals sensitive information (credentials, PII, internal system details) through its outputs or tool calls.

| MCP Posture field | Alignment |
|---|---|
| `servers[].tools[].risk_categories` | Include `credential_access` for tools with access to secrets stores |
| `servers[].tools[].permissions` | Flag any permission containing `secret`, `credential`, or `keystore` |
| `servers[].auth.audience_bound_token_validated` | Audience-bound tokens limit credential scope to the specific MCP server |
| `servers[].auth.per_client_consent_verified` | Consent verification prevents unauthorized credential delegation |

**Detection approach:** Any tool with credential-related permissions and `audience_bound_token_validated: false` is flagged `credential_access`.

---

## ASI07 — Insecure Design

**OWASP description:** Fundamental design flaws in the agent system create security vulnerabilities that cannot be addressed through implementation-level mitigations alone.

| MCP Posture field | Alignment |
|---|---|
| `servers[].session_model` | Stateless handle model (`stateless-handle`) is the secure-by-design choice for MCP 2026-07-28+ |
| `servers[].handle_expiry_policy` | Short-lived handles (`short-lived`) enforce least-privilege temporal scope |
| `permission_graph` | Permission graph exposes structural over-permission issues at design time |

**Detection approach:** Servers still using `session_model: stateful` in MCP 2026-07-28+ deployments indicate insecure design.

---

## ASI08 — Security Misconfiguration

**OWASP description:** Default or misconfigured security settings (e.g., excessive permissions, disabled authentication, outdated dependencies) expose the agent to attack.

| MCP Posture field | Alignment |
|---|---|
| `servers[].auth.pkce_used` | PKCE should be `true` for all OAuth flows; `false` is a misconfiguration |
| `servers[].auth.audience_bound_token_validated` | `false` indicates a token scope misconfiguration |
| `protocol_version` | Outdated protocol versions (pre-`2026-07-28`) indicate unpatched deployments |
| `servers[].version` | Version field enables detection of outdated MCP server deployments |

**Detection approach:** `auth.pkce_used: false` or missing `auth` object triggers misconfiguration finding.

---

## ASI09 — Insufficient Access Controls

**OWASP description:** Inadequate access controls allow unauthorized principals to invoke agent tools or read agent state.

| MCP Posture field | Alignment |
|---|---|
| `servers[].auth` | Full auth object documents the access control posture at capture time |
| `servers[].auth.per_client_consent_verified` | Per-client consent is the MCP 2026-07-28 access control primitive |
| `permission_graph` | Permission graph exposes cross-server privilege escalation paths |
| `servers[].tools[].risk_categories` | `privilege_escalation` captures insufficient access control findings |

**Detection approach:** Servers with tools at `critical` severity and `auth` object absent are flagged as insufficient access controls.

---

## ASI10 — Component Vulnerabilities

**OWASP description:** Third-party components (tools, plugins, MCP servers) used by the agent contain known vulnerabilities that can be exploited.

| MCP Posture field | Alignment |
|---|---|
| `servers[].provenance` | Source hash enables integrity verification against known-good signatures |
| `servers[].version` | Version pinning enables CVE lookup |
| `servers[].tools[].risk_categories` | `supply_chain` captures component-level vulnerabilities |
| `drift` | Drift detection alerts on unexpected component changes between snapshots |

**Detection approach:** Any server with `provenance.source: "unverified-external"` and no `provenance.integrity_hash` is a `supply_chain` risk.

---

## Risk Category Mapping Summary

| OWASP ASI Risk | MCP Posture `risk_categories` Value |
|---|---|
| ASI01 Prompt Injection | `prompt_injection` |
| ASI02 Excessive Agency | `privilege_escalation` |
| ASI03 Insufficient Logging | (no direct category; use attestation fields) |
| ASI04 Data Poisoning | `supply_chain` |
| ASI05 Improper Output | `exfiltration` |
| ASI06 Sensitive Disclosure | `credential_access`, `exfiltration` |
| ASI07 Insecure Design | `privilege_escalation` (structural) |
| ASI08 Misconfiguration | (use `auth` object fields) |
| ASI09 Insufficient Access Controls | `privilege_escalation`, `credential_access` |
| ASI10 Component Vulnerabilities | `supply_chain` |

---

## Additional Risk Categories in MCP Posture (not directly in OWASP Top 10)

| MCP Posture category | Description |
|---|---|
| `ssrf` | Server-Side Request Forgery via tool HTTP calls |
| `command_execution` | Direct system command execution capability |
| `mcp_header_leakage` | MCP-Method and MCP-Name header exposure (MCP 2026-07-28) |

---

## References

- [OWASP Agentic Security Initiative](https://owasp.org/www-project-top-10-for-large-language-model-applications/llm-top-10-governance-doc/)
- [MCP Posture schema](../mcp-posture/schema.json)
- [MCP Posture risk taxonomy](../mcp-posture/risk-taxonomy.md)
- [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)
