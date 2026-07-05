# Milestones

## Milestone 1 — Production Hardening & CLI Tooling

- [ ] `npm install -g @wasmagent/trust-cli` — standalone CLI for generating AgentBOM, MCP Posture, and Trust Passport artifacts
- [ ] `trust-cli generate bom --agent <path>` — command produces valid AgentBOM JSON with tool inventory and permission mapping
- [ ] `trust-cli validate <artifact.json>` — validates artifacts against published JSON schemas with detailed error messages
- [ ] `trust-cli sign <artifact.json> --key <key-path>` — signs Trust Passport with expiry, outputs signed JWT
- [ ] `trust-cli verify <signed-passport.jwt>` — verifies signature, expiry, and chains trust evidence
- [ ] Add E2E test: `npm test` covers full generate → sign → verify → revoke flow
- [ ] Publish `@wasmagent/trust-cli@1.0.0-rc.1` to npm with binary builds for Linux/macOS/Windows
- [ ] Documentation: `docs/cli.md` with complete command reference and examples

## Milestone 2 — Ecosystem Integration & WASM Runtime

- [ ] `@wasmagent/trust-runtime` package for consumption by `wasmagent-js` and other runtimes
- [ ] Runtime API: `AgentTrust.load(bomPath)` validates AgentBOM and returns parsed trust metadata
- [ ] Runtime API: `AgentTrust.checkPermission(tool, action)` returns decision with evidence trace
- [ ] WASM module: `trust_core.wasm` compiled from Rust/Go core validation logic
- [ ] `wasmagent-js` integration: runtime reads AgentBOM at agent load time, enforces declared policies
- [ ] MCP server decorator: wraps MCP servers with posture enforcement based on declared capabilities
- [ ] Integration tests: runtime correctly rejects tools/permissions not declared in AgentBOM
- [ ] Publish `@wasmagent/trust-runtime@1.0.0-rc.1` to npm with TypeScript definitions

## Milestone 3 — Audit Evidence & Compliance Features

- [ ] `AuditLog` schema extension to AgentBOM for structured audit trail entries
- [ ] `trust-cli attest <action>` — generates signed attestation for audit log inclusion
- [ ] `trust-cli audit-report <bom.json>` — generates human-readable audit summary with evidence citations
- [ ] `ComplianceProfile` schema for mapping trust artifacts to compliance frameworks (SOC2, ISO27001, etc.)
- [ ] `trust-cli compliance-check <bom.json> --profile <name>` — validates artifact against selected compliance profile
- [ ] Pre-built profiles: `soc2-2024`, `iso27001-2022`, `eidas-controlled` in `profiles/` directory
- [ ] Test suite validates all compliance profiles with known-good and known-bad fixtures
- [ ] Documentation: `docs/compliance.md` with profile authoring guide

## Milestone 4 — Trust Dashboard & Marketplace Preview

- [ ] Web UI: `trust-dashboard/` React app for visualizing AgentBOM, MCP Posture, and Trust Passport
- [ ] Dashboard renders tool inventory, permission matrix, and trust chain with visual indicators
- [ ] `npm run dev` in dashboard directory starts local development server with example agents
- [ ] Dashboard supports drag-and-drop artifact upload with real-time validation feedback
- [ ] `trust-cli export-dashboard <bom.json> --output <dir>` — generates static HTML report
- [ ] Marketplace schema: `AgentListing.md` for publishing discoverable agents with trust metadata
- [ ] CLI command: `trust-cli publish <bom.json> --registry <url>` — publishes agent listing to registry
- [ ] End-to-end demo: published agent appears in marketplace, buyer verifies trust chain before download