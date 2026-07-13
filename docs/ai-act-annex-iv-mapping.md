# AgentBOM ↔ EU AI Act Annex IV Technical Documentation Mapping

> **Status**: Draft — initial mapping produced for review.
> **Deadline**: 2026-08-02 (EU AI Act Article 11 + Annex IV effective date for high-risk AI systems).
> **Complementary tool**: `open-agent-audit` (`@openagentaudit/core`) maps runtime AEP evidence to Annex IV controls at 40.6% breadth — this table covers **schema-level** mapping (what an AgentBOM *declares* vs. what Annex IV technical documentation requires).

## Purpose

This document maps AgentBOM, MCP Posture, and Trust Passport fields to the technical documentation requirements of EU AI Act Annex IV (Article 11). It enables compliance teams to cite AgentBOM artifacts as evidence toward Annex IV compliance in procurement and audit contexts.

## Coverage Summary

| Category | Sub-items | Covered | Partial | Gap |
|---|---|---|---|---|
| 1. General description of AI system | 5 | 2 | 2 | 1 |
| 2. System elements & development process | 6 | 1 | 3 | 2 |
| 3. Monitoring, functioning, and control | 4 | 1 | 2 | 1 |
| 4. Risk management system | 4 | 3 | 1 | 0 |
| 5. Accuracy, robustness, and cybersecurity | 4 | 0 | 2 | 2 |
| 6. Human oversight | 3 | 0 | 1 | 2 |
| 7. Change management and versioning | 3 | 1 | 1 | 1 |
| **Total** | **29** | **8** | **12** | **9** |

---

## Category 1: General Description of the AI System

### 1.1 Intended purpose and context of use

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Description of the intended purpose, use context, and deployment environment of the AI system | 1(a) | `identity.agent_name`, `identity.deployment_context` | `identity.issuance_context` | Partial | AgentBOM lacks structured "intended purpose" field — only agent name and deployment context (development/staging/production) are captured. Purpose must be inferred from name. |

**Follow-up**: Add `description.intended_purpose` or `identity.intended_use` field to AgentBOM schema to explicitly capture the intended purpose as required by Annex IV 1(a).

### 1.2 Version and specifications

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Software version and related specifications | 1(b) | `identity.agent_version`, `agentbom_version` | `passport_version` | Covered | AgentBOM captures semantic version and schema version. Trust Passport captures passport schema version. |

### 1.3 Hardware requirements and compatibility

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Hardware requirements and compatibility specifications | 1(c) | — | — | Gap | No field in AgentBOM, MCP Posture, or Trust Passport describes hardware requirements or platform compatibility. |

**Follow-up**: Add `deployment.hardware_requirements` field to AgentBOM schema (or extend `identity` block) to capture CPU/GPU/memory/OS requirements.

### 1.4 Input and output specifications

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Input and output specifications including data types, formats, and interfaces | 1(d) | `tool_layer[].permissions`, `permission_layer.data_access` | — | Partial | AgentBOM captures data access boundaries and permission scopes but lacks structured specification of input/output data formats, schemas, and interface descriptions. |

**Follow-up**: Add `interface.data_input_formats` and `interface.data_output_formats` fields to capture structured I/O specs per Annex IV 1(d).

### 1.5 System architecture and design specifications

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| System architecture, design specifications, and component relationships | 1(e) | `model_layer`, `tool_layer`, `prompt_layer`, `permission_layer`, `evidence_layer` | `agentbom_ref`, `posture_ref`, `audit_ref` | Covered | AgentBOM captures the full component inventory: model dependencies, MCP servers, tools, prompt references, permission boundaries, evidence links, and audit log. Trust Passport references the AgentBOM snapshot. MCP Posture captures server-level topology. |

---

## Category 2: Detailed Description of System Elements and Development Process

### 2.1 Development methodology and tools

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Development methodology, tools, and frameworks used to build the AI system | 2(a) | `attestation.generator`, `attestation.generator_version` | — | Partial | AgentBOM captures the tool that generated the BOM (e.g., agent-trust CLI) but not the broader development toolchain or methodology. |

**Follow-up**: Add `metadata.development_toolchain` field listing development tools and frameworks used. Consider extending `attestation` block.

### 2.2 Design specifications and design choices

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Design specifications, design rationale, and key design decisions | 2(b) | — | — | Gap | No field captures design rationale or decision history. AgentBOM is declarative (what), not explanatory (why). |

**Follow-up**: Add `metadata.design_decisions` array field to AgentBOM for recording key design choices, or reference external design decision log (`docs/decision-log.md` for this repo).

### 2.3 Description of data used

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Description of data used for training, validation, and testing (sources, scope, preprocessing) | 2(c) | `evidence_layer.evidence_hashes[].type` | — | Partial | AgentBOM evidence hashes reference data-related events but lacks structured fields for training/validation/test data provenance. Model layer captures `model_id` but not training dataset. |

**Follow-up**: Add `model_layer.training_data` and `model_layer.validation_data` fields to capture dataset references and preprocessing details. Coordinate with CycloneDX ML-BOM alignment (issue #170).

### 2.4 Model architecture and algorithms

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Model architecture, algorithms used, and computational approach | 2(d) | `model_layer.model_id`, `model_layer.provider`, `model_layer.model_version`, `model_layer.capabilities` | — | Covered | AgentBOM captures model ID, provider, version, and declared capabilities. Model ID can resolve to external architecture documentation. |

### 2.5 Training methodology and parameters

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Training methodology, parameters, hyperparameters, and optimization approach | 2(e) | — | — | Gap | AgentBOM does not capture training methodology, hyperparameters, or optimization details. These are typically documented in model cards. |

**Follow-up**: Add `model_layer.training_parameters` field referencing external model card or training documentation. Consider alignment with AIBOM model training fields.

### 2.6 Testing and validation procedures

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Testing and validation procedures used to evaluate system performance | 2(f) | `audit_log[].event_type`, `risk_layer[].description` | `audit_ref`, `evidence_summary.framework_mappings` | Partial | AgentBOM audit log records events but does not have structured testing/validation procedure fields. Trust Passport references audit reports that may contain validation results. |

**Follow-up**: Add `validation.test_results` or extend `evidence_layer` to capture validation procedures and results.

---

## Category 3: Monitoring, Functioning, and Control

### 3.1 Capabilities and limitations

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Description of system capabilities, performance characteristics, and limitations | 3(a) | `model_layer.capabilities`, `tool_layer[].permissions`, `permission_layer.granted_scopes` | `evidence_summary.evidence_quality` | Partial | AgentBOM captures declared capabilities and permission scopes but lacks structured "limitations" or "known failure modes" fields. Trust Passport evidence quality provides a partial assessment. |

**Follow-up**: Add `risk_layer[].limitations` or a dedicated `limitations` array for documenting known system boundaries and failure modes.

### 3.2 Foreseeable unintended outcomes

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Description of foreseeable unintended outcomes and sources of risk | 3(b) | `risk_layer[].description`, `tool_layer[].risk_signals` | `risk_summary` | Covered | AgentBOM risk layer captures known risk signals with severity, category, and status. Tool layer captures per-tool risk signals. Trust Passport summarizes open risks by severity. |

### 3.3 Human oversight measures

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Measures for human oversight of the AI system's operation | 3(c) | `audit_log[].actor`, `permission_layer.granted_scopes` | `revocation`, `validity` | Partial | AgentBOM audit log records human actors and permission scopes. Trust Passport captures revocation/validity controls. However, no structured "human oversight configuration" field exists. |

**Follow-up**: Add `governance.human_oversight` field to AgentBOM schema describing oversight configuration (approval gates, override capabilities, escalation paths).

### 3.4 System life-cycle management

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| System life-cycle management including maintenance, update, and decommissioning procedures | 3(d) | `attestation.timestamp`, `audit_log` | `validity.issued_at`, `validity.expires_at`, `revocation` | Partial | Trust Passport handles validity and revocation lifecycle. AgentBOM captures generation timestamp and audit trail. No dedicated "life-cycle procedures" field exists. |

**Follow-up**: Add `lifecycle.maintenance_procedures`, `lifecycle.update_policy`, and `lifecycle.decommissioning` fields to AgentBOM schema.

---

## Category 4: Risk Management System

### 4.1 Risk identification and analysis

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Risk identification, risk analysis, and risk evaluation results | 4(a) | `risk_layer[].risk_id`, `risk_layer[].severity`, `risk_layer[].category`, `risk_layer[].description` | `risk_summary` | Covered | AgentBOM captures comprehensive risk entries with unique IDs, severity levels, categories, descriptions, and status. Trust Passport summarizes by severity counts. |

### 4.2 Risk mitigation measures

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Risk mitigation measures implemented and their effectiveness | 4(b) | `risk_layer[].status` (mitigated/accepted), `tool_layer[].permissions` (constrained scopes) | — | Partial | AgentBOM records risk mitigation status (mitigated/accepted) and constrained permission scopes, but lacks structured "mitigation_description" or "mitigation_effectiveness" fields. |

**Follow-up**: Add `risk_layer[].mitigation_description` and `risk_layer[].mitigation_evidence` fields to capture how each risk was mitigated and evidence of effectiveness.

### 4.3 Residual risk assessment

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Residual risk assessment after mitigation | 4(c) | `risk_layer[].status` (open status indicates residual risk) | `risk_summary.open_findings` | Covered | Risks with "open" status represent residual risk. Trust Passport explicitly tracks open findings. Severity counts provide residual risk profile. |

### 4.4 Risk management plan

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Risk management plan for the life of the AI system | 4(d) | — | `validity.renewal_triggers`, `revocation.revocation_triggers` | Partial | Trust Passport captures renewal and revocation triggers that form part of a risk management plan. AgentBOM lacks a structured risk management plan field. |

**Follow-up**: Add `risk_management.plan` field or reference document URL to capture the risk management plan. Consider referencing a separate risk management document.

---

## Category 5: Accuracy, Robustness, and Cybersecurity

### 5.1 Accuracy metrics and testing results

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Accuracy metrics, measurement methodologies, and testing results | 5(a) | `evidence_layer.evidence_hashes` (indirect) | `evidence_summary.evidence_quality` | Partial | AgentBOM evidence hashes can reference accuracy evaluation results. Trust Passport assessment of evidence quality provides indirect support. No structured accuracy metrics field exists. |

**Follow-up**: Add `performance.accuracy_metrics` field to AgentBOM or `model_layer.validation_results` for accuracy metrics and methodology descriptions.

### 5.2 Robustness against adversarial inputs

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Robustness testing against adversarial inputs and edge cases | 5(b) | `risk_layer[].category` (prompt_injection, ssrf) | — | Partial | AgentBOM risk layer can capture adversarial risk findings (prompt injection, SSRF, exfiltration). MCP Posture risk taxonomy includes prompt injection as a named risk category. No structured robustness testing field. |

**Follow-up**: Add `robustness.adversarial_testing` field to reference robustness evaluation results. Consider mapping to OWASP Agentic Top 10 ASI01–ASI10 patterns.

### 5.3 Cybersecurity measures and controls

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Cybersecurity measures and controls implemented | 5(c) | `tool_layer[].permissions`, `permission_layer.granted_scopes`, `permission_layer.credential_references` | `agentbom_ref.agentbom_hash` (integrity), `attestation.signature` | Partial | AgentBOM captures permission scopes and credential references that demonstrate security controls. Trust Passport provides signed hash for integrity. No structured cybersecurity control inventory exists (e.g., encrypted storage, authentication, network security). |

**Follow-up**: Add `security.cybersecurity_controls` array field capturing implemented security controls (encryption at rest/in transit, authentication, authorization, network segmentation, etc.).

### 5.4 Error handling and fallback procedures

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Error handling mechanisms and fallback procedures | 5(d) | `audit_log[].outcome` (success/failure/partial) | — | Gap | AgentBOM audit log records outcomes (success/failure/partial) but has no structured error handling configuration or fallback procedure documentation. |

**Follow-up**: Add `resilience.error_handling` and `resilience.fallback_procedures` fields to AgentBOM schema for documenting error handling and failover mechanisms.

---

## Category 6: Human Oversight

### 6.1 Governance framework

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Governance framework for AI system oversight | 6(a) | — | `identity.issuer`, `revocation.revocation_triggers` | Partial | Trust Passport identifies the issuer and specifies revocation triggers that imply governance. No structured governance framework field exists in AgentBOM. |

**Follow-up**: Add `governance.framework` field referencing governance policy documents, oversight board structure, and compliance responsibilities.

### 6.2 Human intervention capabilities

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Capabilities for human intervention, override, and stop mechanisms | 6(b) | — | — | Gap | No field in AgentBOM, MCP Posture, or Trust Passport describes human intervention capabilities, override mechanisms, or stop buttons. |

**Follow-up**: Add `governance.human_intervention` field to AgentBOM capturing stop/override capabilities, approval gates, and manual review triggers.

### 6.3 Oversight mechanisms and controls

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Oversight mechanisms for monitoring system behavior and ensuring compliance | 6(c) | `audit_log`, `evidence_layer.aep_references` | `evidence_summary.framework_mappings` | Partial | AgentBOM audit log and AEP event references provide evidence for monitoring. Trust Passport maps to compliance frameworks. No structured "oversight configuration" field exists. |

**Follow-up**: Add `governance.oversight_config` describing monitoring tooling, alert thresholds, and review cadence.

---

## Category 7: Change Management and Versioning

### 7.1 Version history and changelog

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Version history, changelog, and documentation of system changes | 7(a) | `identity.agent_version`, `agentbom_version` | `passport_version`, `identity.passport_id` | Covered | AgentBOM captures version information. Diff capability (`agent-trust agentbom diff`) enables change tracking between versions. Trust Passport captures its own version. |

### 7.2 Substantial modification tracking

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Tracking of substantial modifications and their impact on compliance | 7(b) | — | `validity.renewal_triggers`, `revocation.revocation_triggers` | Partial | Trust Passport renewal triggers (AgentBOM change, new findings, deployment context change) cover substantial modifications. No structured modification log in AgentBOM. |

**Follow-up**: Add `history.substantial_modifications` array to AgentBOM schema for recording changes that affect compliance posture.

### 7.3 Documentation update procedures

| Annex IV Requirement | Section | AgentBOM Field(s) | Trust Passport Field(s) | Coverage Status | Gap |
|---|---|---|---|---|---|
| Procedures for keeping technical documentation up to date | 7(c) | `attestation.timestamp` | `validity.issued_at`, `validity.expires_at`, `validity.renewal_triggers` | Partial | Trust Passport expiry and renewal model ensures documentation is periodically refreshed. AgentBOM attestation timestamp provides generation date. No dedicated "documentation update procedure" field exists. |

**Follow-up**: Add `metadata.doc_update_policy` field referencing the documentation update procedure and review cadence.

---

## Required Follow-Up Summary

| # | Gap Area | Priority | Recommended Action | Impact |
|---|---|---|---|---|
| 1 | Intended purpose (1.1) | High | Add `identity.intended_purpose` to AgentBOM schema | Enables direct citation for Annex IV 1(a) |
| 2 | Hardware requirements (1.3) | Medium | Add `deployment.hardware_requirements` to AgentBOM schema | Covers Annex IV 1(c) |
| 3 | Input/output formats (1.4) | Medium | Add `interface.data_input_formats` and `interface.data_output_formats` | Covers Annex IV 1(d) |
| 4 | Design rationale (2.2) | Low | Add `metadata.design_decisions` or reference decision-log | Covers Annex IV 2(b) |
| 5 | Training data provenance (2.3) | High | Add `model_layer.training_data` and `model_layer.validation_data` | Covers Annex IV 2(c); aligns with CycloneDX ML-BOM |
| 6 | Training parameters (2.5) | High | Add `model_layer.training_parameters` referencing model card | Covers Annex IV 2(e); aligns with AIBOM |
| 7 | Testing/validation procedures (2.6) | High | Add `validation.test_results` to AgentBOM | Covers Annex IV 2(f) |
| 8 | Human oversight config (3.3, 6.1–6.3) | High | Add `governance.*` fields (oversight, intervention, framework) | Covers Annex IV 3(c), 6(a–c) |
| 9 | Lifecycle management (3.4) | Medium | Add `lifecycle.*` fields (maintenance, update, decommissioning) | Covers Annex IV 3(d) |
| 10 | Mitigation details (4.2) | High | Add `risk_layer[].mitigation_description` and `.mitigation_evidence` | Covers Annex IV 4(b) |
| 11 | Risk management plan (4.4) | Medium | Add `risk_management.plan` reference field | Covers Annex IV 4(d) |
| 12 | Accuracy metrics (5.1) | High | Add `performance.accuracy_metrics` to AgentBOM | Covers Annex IV 5(a) |
| 13 | Adversarial robustness (5.2) | High | Add `robustness.adversarial_testing` field | Covers Annex IV 5(b); aligns with OWASP ASI mapping |
| 14 | Cybersecurity controls (5.3) | High | Add `security.cybersecurity_controls` array | Covers Annex IV 5(c) |
| 15 | Error handling (5.4) | Medium | Add `resilience.error_handling` and `.fallback_procedures` | Covers Annex IV 5(d) |
| 16 | Change/modification log (7.2) | Medium | Add `history.substantial_modifications` array | Covers Annex IV 7(b) |
| 17 | Doc update procedures (7.3) | Low | Add `metadata.doc_update_policy` reference | Covers Annex IV 7(c) |

## Priority Gaps (Must Address Before 2026-08-02)

1. **Intended purpose field** (#1) — required to map Annex IV 1(a) directly
2. **Training data provenance** (#5) — required for Annex IV 2(c); overlaps with issue #170 action pathway fields
3. **Testing/validation procedures** (#7) — required for Annex IV 2(f)
4. **Human oversight configuration** (#8) — required for Annex IV 3(c) and 6(a–c)
5. **Mitigation details** (#10) — required for Annex IV 4(b)
6. **Accuracy metrics** (#12) — required for Annex IV 5(a)
7. **Adversarial robustness** (#13) — required for Annex IV 5(b)
8. **Cybersecurity controls** (#14) — required for Annex IV 5(c)

## Usage

To cite this mapping in procurement or audit contexts:

1. Reference this document as the schema-level mapping for AgentBOM ↔ Annex IV
2. Use `trust-cli compliance-check agentbom.json --profile profiles/eu-ai-act-annex-iv.json` (profile to be created — see roadmap Phase 5)
3. For runtime evidence mapping, use `open-agent-audit` (`@openagentaudit/core`) which maps live AEP evidence to Annex IV controls

## References

- [EU AI Act Article 11](https://eur-lex.europa.eu/eli/reg/2024/1689/art/11) — Technical documentation obligations
- [EU AI Act Annex IV](https://eur-lex.europa.eu/eli/reg/2024/1689/annex/IV) — Technical documentation content requirements
- [AgentBOM v0.1 Specification](../specs/agentbom/agentbom-v0.1.md)
- [Trust Passport v0.1 Specification](../specs/trust-passport/passport-v0.1.md)
- [MCP Posture v0.1 Specification](../specs/mcp-posture/posture-model-v0.1.md)
- [Compliance Profile Authoring Guide](./compliance.md)
- [Strategy Document](./strategy.md) — Regulatory alignment and competitive positioning
- [External Trends](./external-trends.md) — EU AI Act deadline and industry context
- `open-agent-audit` (`@openagentaudit/core`) — Runtime AEP evidence → regulatory control mapping engine
