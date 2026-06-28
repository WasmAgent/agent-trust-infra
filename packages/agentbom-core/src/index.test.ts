import { describe, it, expect } from "bun:test";
import { validateAgentBOM } from "./index.js";

const VALID_AGENTBOM = {
  agentbom_version: "0.1",
  identity: {
    agent_id: "test-agent-001",
    agent_name: "Test Agent",
    deployment_context: "development",
    generated_at: "2026-06-28T00:00:00Z",
  },
  attestation: { generator: "test" },
};

describe("validateAgentBOM", () => {
  it("accepts valid AgentBOM", () => {
    const result = validateAgentBOM(VALID_AGENTBOM);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing identity", () => {
    const result = validateAgentBOM({ agentbom_version: "0.1", attestation: { generator: "test" } });
    expect(result.valid).toBe(false);
  });

  it("rejects unknown version", () => {
    const result = validateAgentBOM({ ...VALID_AGENTBOM, agentbom_version: "99.0" });
    expect(result.valid).toBe(false);
  });
});
