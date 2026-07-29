# AgentBOM ↔ EU AI Act Annex IV Technical Documentation Mapping

**Regulation:** EU AI Act (Regulation 2024/1689), Article 11 + Annex IV  
**Applies to:** High-risk AI systems as defined in Article 6 and Annex III  
**Compliance deadline:** 2026-08-02 (GPAI general-purpose AI systems), ongoing for Annex III systems  
**AgentBOM version:** v0.1 and later  

---

## Overview

EU AI Act Article 11 requires providers of high-risk AI systems to maintain technical documentation before placing the system on the market. Annex IV enumerates nine categories of required documentation. This document maps each Annex IV requirement to the corresponding AgentBOM fields so compliance teams can demonstrate traceability from the regulation to the artifact.

---

## Annex IV Requirement → AgentBOM Field Mapping

### 1. General Description of the AI System (Annex IV §1)

> A general description of the AI system including its intended purpose, the natural persons or categories of persons the AI system is designed to be used by, the intended users, and the circumstances in which the AI system is intended to be used.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Intended purpose | `identity.agent_name`, `identity.deployment_context` | Use `deployment_context` to specify domain and intended use |
| Intended users / persons affected | `identity.agent_id`, `identity.agent_version` | Document in accompanying `evidence_layer` entries |
| Circumstances of use | `identity.deployment_context` | Values: `staging`, `production`, `research`, `enterprise` |
| Version and release date | `identity.agent_version`, `identity.agent_id` | Semantic version required |
| Type of AI system (software/hardware) | `identity.deployment_context` + `evidence_layer[].evidence_type` | Document as `deployment_evidence` entry |
| Combinations with other products | `tool_layer[].tool_id`, `tool_layer[].source` | Each integrated tool or MCP server is listed here |

---

### 2. Detailed Description of System Elements and Development Process (Annex IV §2)

> Detailed description of the elements of the AI system and of the process for its development, including methods and steps performed to develop the AI system, the design specifications and overall logic of the system, the key design choices, the training data and evaluation datasets used.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Development methods and steps | `evidence_layer[].evidence_type = "build_attestation"` | Capture CI/CD pipeline artifacts here |
| Design specifications | `prompt_layer.system_prompt_hash`, `prompt_layer.prompt_version` | Hash of system prompt is the design spec anchor |
| Overall logic and key choices | `workflow_layer[].workflow_id`, `workflow_layer[].steps` | Each workflow step documents decision logic |
| Training data description | `model_layer.model_id`, `model_layer.provider` | Model provenance; link to model card via `evidence_layer` |
| Evaluation datasets | `evidence_layer[].evidence_type = "evaluation_artifact"` | Link evaluation benchmark descriptions |
| Model card / model documentation | `model_layer.model_id`, `model_layer.provider` | Cite foundation model technical reports |
| Techniques and capabilities | `tool_layer[].permissions`, `tool_layer[].skill_version` | `skill_version` tracks capability versions |
| Training procedures | `model_layer.training_cutoff` | Fine-tuning or RLHF history via `evidence_layer` |

---

### 3. Monitoring, Functioning and Control of the AI System (Annex IV §3)

> Information about the monitoring, functioning and control of the AI system, in particular its capabilities and limitations including expected accuracy, robustness, and cybersecurity as well as any known or foreseeable circumstances that may lead to risks.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Capabilities and limitations | `risk_layer[].risk_id`, `risk_layer[].risk_description` | Each known limitation is a risk entry |
| Known risks | `risk_layer[].severity`, `risk_layer[].mitigation` | All unmitigated risks must be explicitly documented |
| Cybersecurity measures | `tool_layer[].permissions`, `permission_layer[].scope` | Over-permissioned tools are surfaced in risk layer |
| Human oversight measures | `policy_definitions[].policy_type = "oversight"` | Document human-in-the-loop checkpoints |
| Intended operational environment | `identity.deployment_context` | Must match actual deployment context |
| Audit trail | `audit_log[].action`, `audit_log[].actor`, `audit_log[].timestamp` | All operations requiring oversight are logged here |

---

### 4. Appropriateness of Performance Metrics (Annex IV §4)

> Description of the appropriateness of the performance metrics for the specific AI system.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Performance metrics selection | `evidence_layer[].evidence_type = "evaluation_artifact"` | Cite metric definitions and rationale |
| Benchmark results | `evidence_layer[].content_hash`, `evidence_layer[].source_uri` | Point to evaluation reports |
| Metric limitations | `risk_layer[].risk_description` | Document where metrics may be insufficient |

---

### 5. Human Oversight Measures (Annex IV §5)

> Description of the human oversight measures pursuant to Article 14 of the AI Act, including the technical measures to facilitate the interpretation of outputs, measures enabling human operators to decide not to use or override the AI system, and measures facilitating human understanding of the AI system's capabilities and limitations.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Output interpretation aids | `tool_layer[].tool_name`, `tool_layer[].permissions` | Tools that produce interpretable outputs |
| Override mechanisms | `policy_definitions[].policy_type = "override"` | Document stop-loss and circuit breaker policies |
| Human-in-the-loop controls | `workflow_layer[].steps[].requires_human_approval` | Approval gates in workflow steps |
| Logging for oversight | `audit_log[].action`, `audit_log[].evidence_refs` | Evidence chain for oversight decisions |
| Operator training requirements | `evidence_layer[].evidence_type = "deployment_evidence"` | Operator qualification attestations |

---

### 6. Changes Made Through the AI System's Lifecycle (Annex IV §6)

> Description of any changes made to the AI system and its performance throughout its lifecycle, in particular any substantial modifications to the AI system.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Version change history | `identity.agent_version` (semantic versioning required) | Each version is a new BOM; compare via `trust-diff` |
| Substantial modifications | `audit_log[].action = "version_update"`, `audit_log[].timestamp` | Log entries for every modification event |
| Model updates | `model_layer.model_id` changes across BOM versions | Detect model drift via BOM comparison |
| Tool/plugin updates | `tool_layer[].skill_version` | Version each tool capability; track changes |
| Policy updates | `policy_definitions[].policy_id`, `policy_definitions[].version` | Policy version history via audit log |

---

### 7. Standards Applied (Annex IV §7)

> A list of the harmonised standards applied in full or in part by the AI system as well as the relevant technical specifications and the relevant sections of those specifications.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Harmonised standards | `evidence_layer[].evidence_type = "compliance_attestation"` | Cite standard references (e.g., ISO/IEC 42001:2023) |
| Technical specifications | `evidence_layer[].source_uri` | Link to specification documents |
| Compliance profiles applied | Via AgentBOM compliance profile check (`--framework ai-act`) | SOC2, ISO27001, eIDAS, EU AI Act Annex IV profiles |

---

### 8. EU Declaration of Conformity (Annex IV §8)

> A copy of the EU declaration of conformity referred to in Article 47 of the AI Act.

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Declaration of conformity | `attestation.signature`, `attestation.signed_by` | BOM attestation is the machine-readable DoC anchor |
| Signed by authorized representative | `attestation.signed_by`, `attestation.signature` | EdDSA-signed BOM with timestamp serves as binding evidence |
| Timestamp | `attestation.valid_from`, `attestation.expires_at` | RFC3339 timestamps required |
| Linked to specific version | `identity.agent_version` | DoC must reference specific deployed version |

---

### 9. System Evaluation for Compliance (Annex IV §9)

> Detailed description of the system to evaluate the AI system in accordance with Chapter III, Section 5 of the AI Act (conformity assessment).

| Annex IV Sub-requirement | AgentBOM Field | Notes |
|---|---|---|
| Conformity assessment procedure | `evidence_layer[].evidence_type = "compliance_attestation"` | Records of assessment activities |
| Internal audit trail | `audit_log[]` (full array) | Chronological evidence for notified body review |
| Test results | `evidence_layer[].content_hash`, `evidence_layer[].source_uri` | Link to test run artifacts |
| Risk assessment records | `risk_layer[]` (full array) | All identified risks with mitigations |
| Post-market monitoring plan | `policy_definitions[].policy_type = "monitoring"` | Ongoing monitoring policy definitions |

---

## Compliance Profile

The machine-readable compliance profile for this mapping is at:
`profiles/eu-ai-act-annex-iv.json`

To generate a compliance report against this profile:
```sh
agent-trust report <agentbom.json> --framework ai-act
```

To validate a BOM against the Annex IV profile programmatically:
```sh
agent-trust compliance-check <agentbom.json> --profile eu-ai-act-annex-iv
```

---

## Coverage Assessment

| Annex IV Section | Coverage | Fields Required | Fields Available |
|---|---|---|---|
| §1 General description | Full | identity, deployment | identity, tool_layer |
| §2 Development process | Full | model, prompt, workflow | model_layer, prompt_layer, workflow_layer, evidence_layer |
| §3 Monitoring & control | Full | risk, audit, policy | risk_layer, audit_log, policy_definitions |
| §4 Performance metrics | Partial | evaluation evidence | evidence_layer (requires explicit evaluation artifacts) |
| §5 Human oversight | Full | policy, workflow, audit | policy_definitions, workflow_layer, audit_log |
| §6 Lifecycle changes | Full | versioning, audit | identity.agent_version, audit_log |
| §7 Standards | Partial | compliance attestations | evidence_layer (requires explicit standard citations) |
| §8 Declaration of conformity | Full | attestation | attestation |
| §9 Conformity assessment | Full | all layers | all layers |

**Overall coverage: 9/9 sections addressable with AgentBOM v0.1**

---

## References

- [EU AI Act full text (OJ L 2024/1689)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)
- [Annex IV — Technical Documentation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#d1e6514-1-1)
- [Article 11 — Technical Documentation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#d1e2386-1-1)
- [Article 14 — Human Oversight](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#d1e2678-1-1)
- [Article 47 — EU Declaration of Conformity](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#d1e4494-1-1)
