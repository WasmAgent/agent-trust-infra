# Roadmap

> **Status: public research preview.** The Weeks 0–12 milestones are complete
> and shipped — public repo and the three specifications, now implemented in
> the codebase with JSON schemas and validators (Weeks 0–6), working examples,
> and the **Weeks 6–12 close-out: end-to-end chain visualization, runnable
> demo, and README stitching (PR #42)**. These
> shipped features are recorded in the [Changelog](./CHANGELOG.md). This roadmap
> lists only future and in-flight work, which is tracked as follow-up issues.

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
