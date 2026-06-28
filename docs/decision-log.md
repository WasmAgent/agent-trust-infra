# Decision Log

## 2026-06-28 — Create agent-trust-infra as monorepo instead of three separate repos

**Decision:** Create a single `WasmAgent/agent-trust-infra` repository instead of separate `WasmAgent/agentbom`, `WasmAgent/mcp-posture`, `WasmAgent/trust-passport`.

**Rationale:** AgentBOM, MCP Posture, and Trust Passport form a continuous trust chain, not three isolated products. A monorepo enables faster exploration, unified narrative, reduced maintenance overhead, and clearer communication that WasmAgent is actively exploring new boundaries.

**Split criteria:** See [project-boundaries.md](./project-boundaries.md) for conditions under which each artifact may be split into a standalone repository.

---

## 2026-06-28 — Use "research preview" positioning, not "production software"

**Decision:** All public communication and repository metadata uses "experimental research preview" language. No production readiness claims.

**Rationale:** The three specifications are not stable. The goal of going public is to occupy the Agent Trust Infrastructure narrative and signal ongoing innovation, not to claim maturity. Premature production claims would create legal and reputational risk.

---

## 2026-06-28 — Trust Passport product home is open-agent-audit / Trustavo

**Decision:** Trust Passport will be incubated in this repository but its intended product home is `open-agent-audit / Trustavo` at `trustavo.com/passport`.

**Rationale:** Trust Passport is a downstream service of audit reports. Its natural home is the audit product, not a standalone open-source specification.
