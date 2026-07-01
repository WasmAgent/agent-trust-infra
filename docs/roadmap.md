# Roadmap

> **Status: public research preview — not production software.** All Weeks 0–12
> deliverables are **Shipped / Closed** — the public repo and the three
> specifications (AgentBOM, MCP Posture, Trust Passport), implemented in the
> codebase with JSON schemas and validators (Weeks 0–6), the working examples,
> and the Weeks 6–12 close-out (end-to-end chain visualization, runnable demo,
> and README stitching, PR #42). "Shipped / Closed" records these
> research-preview deliverables; it is not a production-readiness claim, and the
> repository's public production status remains an experimental research preview
> (see [`decision-log.md`](./decision-log.md)). The canonical,
> cross-organization record of that public production status — including the
> 'Published' spec status mirrored here — is the `wasmagent` **Release Ledger**;
> this roadmap defers to it so the two repos cannot diverge. Shipped features
> are recorded in the [Changelog](./CHANGELOG.md); this roadmap lists only
> future and in-flight work, tracked as follow-up issues.

## Shipped / Closed (Weeks 0–12)

These milestones are complete — they record what this repository already ships,
not outstanding work. See the [Changelog](./CHANGELOG.md) for the full per-item
checklist.

| Specification | Status |
|---|---|
| AgentBOM | Shipped |
| MCP Posture | Shipped |
| Trust Passport | Shipped |

- [x] **Weeks 0–2 — repo and spec skeletons:** public repo,
      vision/architecture/boundaries docs, and the AgentBOM, MCP Posture, and
      Trust Passport spec skeletons.
- [x] **Weeks 2–6 — working examples:** JSON schemas and validators for
      AgentBOM, MCP Posture, and Trust Passport, plus fixture-based tests.
- [x] **Weeks 6–12 — end-to-end demo (close-out):** the full trust chain is
      wired up — one command (`agent-trust chain` /
      `examples/bscode-agent/run-chain.sh`) walks
      `bscode → CapabilityManifest + AEP → AgentBOM → MCP Posture → audit
      report → Trust Passport` offline, with an architecture diagram and a
      runnable demo.

## In-flight / future work

The following items are **not yet shipped**. They are tracked as follow-up
issues and listed here as the active roadmap.

- [ ] Federation with `open-agent-audit` / `trace-pipeline` for shared evidence
      and audit-report plumbing
- [ ] Cryptographic Trust Passport signing (signed, revocable, expiring trust
      state beyond the current reference validity model)
- [ ] Static site for [`papers/`](../papers) so the technical reports are
      browseable on the web
- [ ] Apply split criteria (see below) once individual artifacts stabilize

## Future: split criteria

See [project-boundaries.md](./project-boundaries.md) for criteria governing when
AgentBOM, MCP Posture, or Trust Passport may be split into standalone
repositories. The intended future homes are:

- **AgentBOM** — may become a standalone specification repository if the schema
  stabilizes and external adoption or standardization needs emerge.
- **MCP Posture** — may become a standalone MCP security product if demand
  appears; runtime scanning primitives are owned by `wasmagent-js`.
- **Trust Passport** — expected to become a product module under
  `open-agent-audit` / Trustavo once its schema, validity model, renewal
  triggers, and revocation model are stable.
