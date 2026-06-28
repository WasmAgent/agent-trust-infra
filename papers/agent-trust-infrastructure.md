# Agent Trust Infrastructure

> Status: experimental research preview.
> Not production software.
> Not a compliance certification product.

This short technical report describes the rationale and architecture for Agent Trust Infrastructure.

## Abstract

AI agents are deployable systems with tools, permissions, model dependencies, MCP connections, and runtime policies. Existing artifact standards (SBOM, AIBOM) do not capture agent-specific runtime authority and evidence chains.

This repository explores three trust artifacts:

1. **AgentBOM** — bill of materials for AI agents
2. **MCP Posture** — permission attack surface for MCP-connected agents
3. **Trust Passport** — signed, expiring trust-state artifact

Together they form a chain from runtime facts to verifiable trust state.

## Problem statement

Enterprise deployment of AI agents raises questions that existing tools cannot answer:

- What tools and MCP servers can this agent access?
- What permissions has it been granted?
- Are there known risks?
- Has the permission surface changed?
- What is the current trust state, and when was it last reviewed?

These questions require runtime-derived artifacts, not just configuration declarations or model cards.

## Architecture

See [docs/architecture.md](../docs/architecture.md) for the full trust artifact chain.

## Status

All specifications and implementations in this repository are experimental.
