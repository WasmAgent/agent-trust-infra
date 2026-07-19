# Enterprise Onboarding & Certification Guide

> **Status:** operational runbook — for security, compliance, and platform teams
> adopting Agent Trust Infrastructure before approving AI agents for production.
> **Last updated:** 2026-07-20.
> **Tracking:** WasmAgent/agent-trust-infra#223 (Milestone 8).

## 1. Purpose and audience

This guide is the single onboarding document for organizations adopting Agent
Trust Infrastructure (AgentBOM, MCP Posture, Trust Passport). It gives security
teams three concrete, repeatable artifacts:

1. **Adoption runbooks** — step-by-step procedures for standing up trust artifact
   generation, validation, and review inside an existing SDLC.
2. **Attestation collection procedures** — how to gather, sign, and store the
   evidence that backs a Trust Passport.
3. **Trustworthiness review checklist** — the gate an agent must clear before it
   is approved for production deployment.

It is written for **security engineers, GRC analysts, and platform/SRE leads** who
own agent approval. It assumes familiarity with the artifacts described in
`docs/architecture.md` and the CLI in `cli/`.

> **Scope note.** This repo is the *specification and reference validator* layer.
> Runtime evidence emission lives in `wasmagent-js`; regulatory control mapping
> and Trust Passport *product* issuance live in `open-agent-audit`. This guide
> references those boundaries explicitly so enterprises wire the correct component
> into each step (see `docs/project-boundaries.md`).

## 2. Prerequisites

Before onboarding, the adopting organization must have:

| Requirement | Why | Where |
|---|---|---|
| Node.js 20+ or Bun 1.3+ runtime | Runs `trust-cli` and the reference validators | `README.md` quick start |
| A signing key pair (Ed25519) | Signs Trust Passports as JWTs (EdDSA) | `cli/src/passport-sign.ts` |
| An agent source directory | Inputs to AgentBOM generation (tool defs, prompts) | `examples/bscode-agent/` |
| A compliance profile | Drives `compliance-check` weighted scoring | `profiles/` |
| Access to runtime AEP evidence (if applicable) | Feeds the evidence layer; emitted by `wasmagent-js` | `docs/relationship-to-wasmagent.md` |

For air-gapped or FIPS-constrained environments, see §8 (future hardening) — the
reference CLI ships Ed25519 today; SIGSTORE/FIPS backends are a Milestone 8
production-hardening item tracked separately.

## 3. Adoption runbooks

Each runbook is a sequenced procedure with a definition of done. Run them in
order the first time an agent is onboarded; thereafter only the per-release
runbook (3.4) repeats.

### 3.1 RB-1 — Install and smoke-test the toolchain

**Goal:** a working `trust-cli` that can validate a known-good fixture.

**Steps:**

1. Install dependencies (Bun toolchain):
   ```bash
   bun install
   bun run lint && bun run typecheck && bun run test
   ```
2. Run the end-to-end offline demo to confirm the full chain works in your
   environment:
   ```bash
   examples/bscode-agent/run-chain.sh
   ```
3. Validate the shipped fixture to confirm the validator is wired:
   ```bash
   trust-cli agentbom inspect examples/bscode-agent/bscode.bom.json
   trust-cli compliance-check examples/bscode-agent/bscode.bom.json \
     --profile soc2-2024 --min-score 70
   ```

**Definition of done:** `run-chain.sh` exits 0 and produces an AgentBOM, an MCP
Posture snapshot, an audit report, and a Trust Passport in the output directory.

### 3.2 RB-2 — Generate the first AgentBOM for a target agent

**Goal:** a schema-valid AgentBOM describing the candidate production agent.

**Steps:**

1. Point the generator at the agent source directory:
   ```bash
   trust-cli agentbom generate --agent ./my-agent
   ```
2. Inspect the output for completeness — every production tool, MCP server, and
   permission scope the agent holds at runtime must appear in the `tool_layer`
   and `permission_layer`:
   ```bash
   trust-cli agentbom inspect my-agent.bom.json
   ```
3. Cross-check against the spec to confirm no layer is empty that should not be
   (see the layer table in `docs/openssf-proposal.md` §3).

**Definition of done:** `tool_layer`, `permission_layer`, and `prompt_layer` each
reflect the actual deployed agent, and `attestation.generator` is populated.

> **Runtime gap.** If the generator under-reports tools or permissions, the agent
> runtime is not emitting a `CapabilityManifest` — that emission lives in
> `wasmagent-js` (`@wasmagent/mcp-gateway`, `@wasmagent/mcp-attestation`). Do not
> hand-edit the BOM to compensate; fix the upstream emission and regenerate.

### 3.3 RB-3 — Capture MCP Posture

**Goal:** a posture snapshot documenting the agent's MCP permission attack surface.

**Steps:**

1. Validate the MCP Posture snapshot against the schema:
   ```bash
   trust-cli mcp-posture validate my-agent.posture.json
   ```
2. Inspect for high-severity risk entries (excessive scopes, unbounded tool
   access, `MCP-Method`/`MCP-Name` header leakage risk patterns):
   ```bash
   trust-cli mcp-posture inspect my-agent.posture.json
   ```
3. Record a baseline snapshot in version control — subsequent `mcp-posture diff`
   runs measure drift against this baseline.

**Definition of done:** a committed baseline posture snapshot with zero
unjustified `high`/`critical` risk entries, or each such entry tied to an
accepted risk record.

### 3.4 RB-4 — Per-release diff and re-validation

**Goal:** confirm what changed between the certified baseline and a candidate
release before it ships.

**Steps:**

1. Diff the candidate AgentBOM against the certified baseline:
   ```bash
   trust-cli agentbom diff baseline.bom.json candidate.bom.json
   ```
2. Diff MCP Posture for permission drift / escalation:
   ```bash
   trust-cli mcp-posture diff baseline.posture.json candidate.posture.json
   ```
3. Re-run compliance-check against the candidate:
   ```bash
   trust-cli compliance-check candidate.bom.json --profile soc2-2024
   ```

**Definition of done:** the diff is reviewed by a security approver; any
permission expansion or new high-risk tool is either reverted or carries an
approved exception before the candidate is re-baselined.

## 4. Attestation collection procedures

A Trust Passport is only as trustworthy as the evidence behind it. This section
defines how evidence is collected, hashed, signed, and retained so a passport can
be independently verified.

### 4.1 Evidence sources

| Source | Artifact | Produced by |
|---|---|---|
| Agent composition | AgentBOM | `trust-cli agentbom generate` (this repo) |
| Permission attack surface | MCP Posture snapshot | This repo (from runtime feed) |
| Runtime actions | AEP evidence records | `wasmagent-js` (`@wasmagent/aep`) |
| Capability provenance | Capability manifests | `wasmagent-js` (`@wasmagent/mcp-attestation`) |
| Regulatory mapping | Audit report + control map | `open-agent-audit` (`@openagentaudit/core`) |

> **Boundary.** Do not re-implement AEP emission or control mapping in this repo.
> Collect those artifacts from the component that owns them and reference them by
> hash from the AgentBOM `evidence_layer`.

### 4.2 Collection procedure (ATT-1)

1. **Freeze the release candidate** — tag the exact agent version, prompt
   version, and tool/MCP versions. Record the commit SHA(s).
2. **Generate artifacts** — run RB-2 and RB-3 against the frozen candidate.
3. **Gather runtime evidence** — export the AEP evidence records covering the
   acceptance test window from `wasmagent-js`.
4. **Compute and record hashes** — store the SHA-256 of each collected artifact
   in the AgentBOM `evidence_layer` so any later tampering is detectable.
5. **Map to controls** — produce the audit report and regulatory control mapping
   via `open-agent-audit`:
   ```bash
   trust-cli audit-report candidate.bom.json
   ```
6. **Sign the passport** — bind the evidence into a signed Trust Passport:
   ```bash
   trust-cli passport sign candidate.passport.json --key ./keys/ed25519.key
   ```
7. **Verify end-to-end** before handing to the approver:
   ```bash
   trust-cli passport verify-signed candidate.passport.jwt --key ./keys/ed25519.pub
   ```

**Definition of done:** a signed passport JWT whose evidence hashes match the
collected artifacts and whose signature verifies against the public key.

### 4.3 Storage and retention

- Store signed passports, source artifacts, and AEP evidence in append-only,
  tamper-evident storage. The content-addressable evidence store is tracked for
  the Trust Passport product home in `open-agent-audit` (issues
  WasmAgent/open-agent-audit#52, #53, #54).
- Retention period must meet the longest applicable regulatory window (e.g., EU
  AI Act post-market monitoring for high-risk systems). Confirm the window with
  GRC before pruning.
- Private signing keys never leave the controlled signing environment; only the
  public key is distributed for verification.

## 5. Trustworthiness review checklist

This is the **production deployment gate**. An agent may not be promoted to
production until every item is checked. The approver (a named security engineer
or GRC lead) signs off the checklist; the signed-off checklist is itself retained
as evidence.

### 5.1 Composition completeness

- [ ] AgentBOM validates against `specs/agentbom/schema.json`.
- [ ] `identity`, `model_layer`, `tool_layer`, `prompt_layer`,
      `permission_layer` are all populated and match the deployed agent.
- [ ] Every MCP server the agent connects to appears in `tool_layer` with its
      permission scopes.
- [ ] Prompt versions/hashes are recorded and reproducible from source.

### 5.2 Permission and attack-surface review

- [ ] MCP Posture snapshot validates and has a committed baseline.
- [ ] No unexplained `high`/`critical` risk entries; each carries an accepted
      risk record or is remediated.
- [ ] No permission scope expansion versus the certified baseline without an
      approved exception (`mcp-posture diff` clean or justified).
- [ ] Known prompt-injection / excessive-agency vectors (OWASP Agentic Top 10
      ASI01–ASI10) reviewed against the risk taxonomy.

### 5.3 Evidence and attestation

- [ ] AEP evidence covers the acceptance test window and hashes match the
      `evidence_layer`.
- [ ] Audit report generated and reviewed (`trust-cli audit-report`).
- [ ] Compliance-check passes against the target profile(s) at the agreed
      minimum score (e.g., `--profile soc2-2024 --min-score 70`).
- [ ] Trust Passport signed and signature verifies against the distributed
      public key.

### 5.4 Operational readiness

- [ ] Passport expiry and renewal triggers understood by the on-call owner.
- [ ] Rollback path defined if the agent or a tool is later found untrustworthy.
- [ ] Monitoring for BOM drift / permission escalation is in place (Continuous
      Trust Monitoring — Milestone 8 roadmap item; until shipped, schedule
      periodic `agentbom diff` / `mcp-posture diff` against baseline).
- [ ] Incident response runbook references the retained evidence location.

### 5.5 Regulatory mapping (when applicable)

- [ ] If the system is high-risk under EU AI Act, the Annex IV mapping
      (`docs/ai-act-annex-iv-mapping.md`) is attached and gaps have owners.
- [ ] Required compliance profiles (`soc2-2024`, `iso27001-2022`,
      `eidas-controlled`) are checked and pass.

**Approval:** _Approver name / role / date / signature key id_ — recorded with
the retained evidence.

## 6. Roles and responsibilities (RACI)

| Activity | Security eng | GRC analyst | Platform/SRE | Agent owner |
|---|---|---|---|---|
| AgentBOM generation | C | I | R | A |
| MCP Posture baseline | R | C | A | I |
| Attestation collection | A | C | R | I |
| Checklist sign-off | A | R | C | C |
| Passport signing key custody | A | C | R | I |
| Post-deployment drift monitoring | C | I | A/R | R |

_R =responsible, A=accountable, C=consulted, I=informed._

## 7. Certification lifecycle

1. **Onboard** — run RB-1 through RB-3; establish baselines.
2. **Certify** — complete §5 checklist; sign and store the passport.
3. **Monitor** — re-run RB-4 each release; watch for drift.
4. **Recertify** — on passport expiry, scope expansion, or incident; repeat §4
   and §5.
5. **Revoke** — if trust is broken, mark the passport revoked via the Trust
   Passport product (`open-agent-audit` / Trustavo) and execute the rollback
   path. Revocation/renewal beyond the reference validity model is a Milestone 6
   production-hardening item.

## 8. Related references

| Resource | What it covers |
|---|---|
| `README.md` | Quick start and trust chain diagram |
| `docs/architecture.md` | Trust artifact chain and component responsibilities |
| `docs/compliance.md` | Compliance profile authoring guide |
| `docs/ai-act-annex-iv-mapping.md` | AgentBOM ↔ EU AI Act Annex IV mapping |
| `docs/project-boundaries.md` | What lives in this repo vs. `wasmagent-js` / `open-agent-audit` |
| `docs/relationship-to-wasmagent.md` | Runtime boundary and duplicated-logic avoidance |
| `profiles/` | Pre-built compliance profiles (`soc2-2024`, `iso27001-2022`, `eidas-controlled`) |
| `examples/bscode-agent/run-chain.sh` | Full offline trust-chain demo |
| `cli/src/index.ts` | `trust-cli` command reference |
