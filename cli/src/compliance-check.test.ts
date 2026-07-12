/**
 * Compliance check test suite.
 *
 * Tests all compliance profiles with known-good and known-bad fixtures.
 * Known-good fixtures should pass compliance checks, while known-bad fixtures
 * should fail with specific error messages.
 */
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import {
  complianceCheckCommand,
  ViolationHistoryEntry,
  getHistoryPath,
  loadViolationHistory,
  saveViolationHistory,
  violationKey,
  applyAdaptiveWeighting,
} from "./compliance-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("compliance-check: adaptive weighting core logic", () => {
  describe("violationKey", () => {
    it("normalizes whitespace", () => {
      expect(violationKey("hello   world")).toBe("hello world");
    });

    it("trims leading and trailing whitespace", () => {
      expect(violationKey("  hello world  ")).toBe("hello world");
    });

    it("preserves identical messages", () => {
      const msg = "tool_layer: tool \"Bash\" has blocked permission \"process:exec\" (matches \"process:exec\")";
      expect(violationKey(msg)).toBe(msg);
    });
  });

  describe("applyAdaptiveWeighting", () => {
    it("leaves first-time warnings as warnings (count 1)", () => {
      const history: Record<string, ViolationHistoryEntry> = {};
      const result = applyAdaptiveWeighting(
        [],
        ["test warning"],
        history,
        "2026-01-01T00:00:00Z",
      );
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(["test warning"]);
      expect(history["test warning"].count).toBe(1);
    });

    it("boosts repeat warnings to errors with [REPEAT] prefix", () => {
      const history: Record<string, ViolationHistoryEntry> = {
        "test warning": {
          violationKey: "test warning",
          firstSeen: "2026-01-01T00:00:00Z",
          lastSeen: "2026-01-01T00:00:00Z",
          count: 1,
        },
      };
      const result = applyAdaptiveWeighting(
        [],
        ["test warning"],
        history,
        "2026-01-02T00:00:00Z",
      );
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual(["[REPEAT] test warning"]);
      expect(history["test warning"].count).toBe(2);
      expect(history["test warning"].lastSeen).toBe("2026-01-02T00:00:00Z");
    });

    it("increments count for existing errors without changing their classification", () => {
      const history: Record<string, ViolationHistoryEntry> = {
        "an error": {
          violationKey: "an error",
          firstSeen: "2026-01-01T00:00:00Z",
          lastSeen: "2026-01-01T00:00:00Z",
          count: 1,
        },
      };
      const result = applyAdaptiveWeighting(
        ["an error"],
        [],
        history,
        "2026-01-02T00:00:00Z",
      );
      expect(result.errors).toEqual(["an error"]);
      expect(result.warnings).toEqual([]);
      expect(history["an error"].count).toBe(2);
    });

    it("handles mixed errors and warnings correctly", () => {
      const history: Record<string, ViolationHistoryEntry> = {
        "repeat warning": {
          violationKey: "repeat warning",
          firstSeen: "2026-01-01T00:00:00Z",
          lastSeen: "2026-01-01T00:00:00Z",
          count: 1,
        },
        "existing error": {
          violationKey: "existing error",
          firstSeen: "2026-01-01T00:00:00Z",
          lastSeen: "2026-01-01T00:00:00Z",
          count: 1,
        },
      };
      const result = applyAdaptiveWeighting(
        ["existing error", "new error"],
        ["repeat warning", "first-time warning"],
        history,
        "2026-01-02T00:00:00Z",
      );
      // "repeat warning" should be boosted, "first-time warning" stays as warning
      expect(result.errors).toContain("[REPEAT] repeat warning");
      expect(result.errors).toContain("existing error");
      expect(result.errors).toContain("new error");
      expect(result.warnings).toEqual(["first-time warning"]);
      expect(history["repeat warning"].count).toBe(2);
      expect(history["existing error"].count).toBe(2);
      expect(history["new error"].count).toBe(1);
    });
  });

  describe("history persistence", () => {
    const testDir = resolve(__dirname, ".test-trust-cli-tmp");
    const originalCwd = process.cwd;

    beforeEach(() => {
      // Clean up any previous test artifacts
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
      // Override process.cwd to point to our test directory
      process.cwd = () => testDir;
    });

    afterEach(() => {
      process.cwd = originalCwd;
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("loadViolationHistory returns empty object when no file exists", () => {
      const history = loadViolationHistory();
      expect(history).toEqual({});
    });

    it("saveViolationHistory and loadViolationHistory round-trip", () => {
      const history: Record<string, ViolationHistoryEntry> = {
        "test violation": {
          violationKey: "test violation",
          firstSeen: "2026-01-01T00:00:00Z",
          lastSeen: "2026-01-01T00:00:00Z",
          count: 1,
        },
      };

      saveViolationHistory(history);
      const loaded = loadViolationHistory();
      expect(loaded).toEqual(history);
    });

    it("getHistoryPath returns path relative to CWD", () => {
      const path = getHistoryPath();
      expect(path).toBe(resolve(testDir, ".trust-cli", "history.json"));
    });
  });
});

describe("compliance-check: profile validation with fixtures", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    consoleOutput = [];
    errorOutput = [];

    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  function getFixturePath(fixtureName: string): string {
    return resolve(__dirname, "compliance-fixtures", fixtureName);
  }

  describe("SOC2 2024 profile", () => {
    const profileId = "soc2-2024";

    it("accepts known-good SOC2 fixture", () => {
      const fixturePath = getFixturePath("soc2-2024-known-good.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

      expect(exitCode).toBe(0);
      expect(errorOutput).toHaveLength(0);
      expect(consoleOutput.some((line) => line.includes("✓ COMPLIANT"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("SOC2"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("2024"))).toBe(true);
    });

    it("rejects known-bad SOC2 fixture", () => {
      const fixturePath = getFixturePath("soc2-2024-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes("✗ NON-COMPLIANT"))).toBe(true);

      const errorText = consoleOutput.join("\n");
      // Known-bad fixture has multiple violations:
      // - development context (not in allowed contexts)
      // - tools with high/critical severity
      // - blocked permissions
      // - blocked sources
      // - unmitigated critical risks
      // - missing signature and timestamp
      expect(errorText).toMatch(/development_context|deployment_context/);
      expect(errorText).toMatch(/tool_layer/);
      expect(errorText).toMatch(/risk_layer/);
      expect(errorText).toMatch(/attestation/);
    });
  });

  describe("ISO27001 2022 profile", () => {
    const profileId = "iso27001-2022";

    it("accepts known-good ISO27001 fixture", () => {
      const fixturePath = getFixturePath("iso27001-2022-known-good.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

      expect(exitCode).toBe(0);
      expect(errorOutput).toHaveLength(0);
      expect(consoleOutput.some((line) => line.includes("✓ COMPLIANT"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("ISO27001"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("2022"))).toBe(true);
    });

    it("rejects known-bad ISO27001 fixture", () => {
      const fixturePath = getFixturePath("iso27001-2022-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes("✗ NON-COMPLIANT"))).toBe(true);

      const errorText = consoleOutput.join("\n");
      // Known-bad fixture has multiple violations:
      // - staging context (only production allowed)
      // - tools with critical severity
      // - blocked permissions (filesystem:write unrestricted)
      // - blocked sources (unverified-external)
      // - unmitigated critical risks
      // - missing signature and timestamp
      expect(errorText).toMatch(/deployment_context|staging/);
      expect(errorText).toMatch(/tool_layer/);
      expect(errorText).toMatch(/risk_layer/);
      expect(errorText).toMatch(/attestation/);
    });
  });

  describe("EIDAS controlled profile", () => {
    const profileId = "eidas-controlled";

    it("accepts known-good EIDAS fixture", () => {
      const fixturePath = getFixturePath("eidas-controlled-known-good.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

      expect(exitCode).toBe(0);
      expect(errorOutput).toHaveLength(0);
      expect(consoleOutput.some((line) => line.includes("✓ COMPLIANT"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("EIDAS"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("controlled"))).toBe(true);
    });

    it("rejects known-bad EIDAS fixture", () => {
      const fixturePath = getFixturePath("eidas-controlled-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes("✗ NON-COMPLIANT"))).toBe(true);

      const errorText = consoleOutput.join("\n");
      // Known-bad fixture has multiple violations:
      // - development context (only production allowed)
      // - tools with medium severity (max allowed is low)
      // - blocked permissions (filesystem:write, network:external, system:execute)
      // - blocked sources (external, unverified)
      // - unmitigated critical and high risks
      // - 2 unmitigated medium risks (max allowed is 1)
      // - missing signature and timestamp
      expect(errorText).toMatch(/deployment_context|development/);
      expect(errorText).toMatch(/tool_layer/);
      expect(errorText).toMatch(/risk_layer/);
      expect(errorText).toMatch(/attestation/);
    });
  });

  describe("fixture schema validation", () => {
    it("all known-good fixtures have valid AgentBOM schema", () => {
      const { validateAgentBOM } = require("../../packages/agentbom-core/src/index.js");
      const { readFileSync } = require("node:fs");

      const knownGoodFixtures = [
        "soc2-2024-known-good.json",
        "iso27001-2022-known-good.json",
        "eidas-controlled-known-good.json",
      ];

      for (const fixtureName of knownGoodFixtures) {
        const fixturePath = getFixturePath(fixtureName);
        const fixtureContent = readFileSync(fixturePath, "utf-8");
        const fixtureData = JSON.parse(fixtureContent);

        const validation = validateAgentBOM(fixtureData);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it("all known-bad fixtures have valid AgentBOM schema but fail compliance", () => {
      const { validateAgentBOM } = require("../../packages/agentbom-core/src/index.js");
      const { readFileSync } = require("node:fs");

      const knownBadFixtures = [
        "soc2-2024-known-bad.json",
        "iso27001-2022-known-bad.json",
        "eidas-controlled-known-bad.json",
      ];

      for (const fixtureName of knownBadFixtures) {
        const fixturePath = getFixturePath(fixtureName);
        const fixtureContent = readFileSync(fixturePath, "utf-8");
        const fixtureData = JSON.parse(fixtureContent);

        // Schema should be valid
        const validation = validateAgentBOM(fixtureData);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });
  });

  describe("compliance check behavior", () => {
    it("returns error for non-existent profile", () => {
      const fixturePath = getFixturePath("soc2-2024-known-good.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", "nonexistent-profile"]);

      expect(exitCode).toBe(1);
      expect(errorOutput.some((line) => line.includes("cannot load compliance profile"))).toBe(true);
    });

    it("returns error for non-existent fixture file", () => {
      const exitCode = complianceCheckCommand(["/nonexistent/file.json", "--profile", "soc2-2024"]);

      expect(exitCode).toBe(1);
      expect(errorOutput.some((line) => line.includes("cannot read AgentBOM file"))).toBe(true);
    });

    it("returns error for invalid JSON", () => {
      const exitCode = complianceCheckCommand(["--profile", "soc2-2024"]);

      expect(exitCode).toBe(1);
      expect(errorOutput.length).toBeGreaterThan(0);
    });
  });

  describe("profile coverage", () => {
    it("all three compliance profiles are tested", () => {
      const profiles = ["soc2-2024", "iso27001-2022", "eidas-controlled"];
      const fixtures = [
        "soc2-2024-known-good.json",
        "iso27001-2022-known-good.json",
        "eidas-controlled-known-good.json",
      ];

      for (let i = 0; i < profiles.length; i++) {
        const profileId = profiles[i];
        const fixturePath = getFixturePath(fixtures[i]);
        const exitCode = complianceCheckCommand([fixturePath, "--profile", profileId]);

        expect(exitCode).toBe(0);
      }
    });
  });

  describe("adaptive weighting integration", () => {
    let originalCwd: typeof process.cwd;
    const testDir = resolve(__dirname, ".test-adaptive-tmp");

    beforeEach(() => {
      // Clean up test directory
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
      mkdirSync(testDir, { recursive: true });
      // Override CWD for this test
      originalCwd = process.cwd;
      process.cwd = () => testDir;
    });

    afterEach(() => {
      process.cwd = originalCwd;
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("prints adaptive weighting: enabled when --adaptive flag is passed", () => {
      const fixturePath = getFixturePath("eidas-controlled-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", "eidas-controlled", "--adaptive"]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes("Adaptive weighting: enabled"))).toBe(true);
    });

    it("does not print adaptive message when --adaptive is not passed", () => {
      const fixturePath = getFixturePath("eidas-controlled-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", "eidas-controlled"]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes("Adaptive weighting"))).toBe(false);
    });

    it("persists history file after adaptive run", () => {
      const fixturePath = getFixturePath("eidas-controlled-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--profile", "eidas-controlled", "--adaptive"]);

      expect(exitCode).toBe(1);

      // Verify history file was created
      const historyPath = resolve(testDir, ".trust-cli", "history.json");
      expect(existsSync(historyPath)).toBe(true);

      const historyRaw = readFileSync(historyPath, "utf-8");
      const history = JSON.parse(historyRaw) as Record<string, ViolationHistoryEntry>;
      expect(Object.keys(history).length).toBeGreaterThan(0);

      // All entries should be valid
      for (const entry of Object.values(history)) {
        expect(entry.violationKey).toBeTruthy();
        expect(entry.count).toBeGreaterThanOrEqual(1);
        expect(entry.firstSeen).toBeTruthy();
        expect(entry.lastSeen).toBeTruthy();
      }
    });

    it("boosts warnings to errors on second adaptive run", () => {
      const fixturePath = getFixturePath("eidas-controlled-known-bad.json");

      // First run: record violations
      const exitCode1 = complianceCheckCommand([fixturePath, "--profile", "eidas-controlled", "--adaptive"]);
      expect(exitCode1).toBe(1);
      const firstRunOutput = [...consoleOutput];
      consoleOutput = [];
      errorOutput = [];

      // Second run: warnings should be boosted
      const exitCode2 = complianceCheckCommand([fixturePath, "--profile", "eidas-controlled", "--adaptive"]);
      expect(exitCode2).toBe(1);

      // Check that [REPEAT] markers appear in the output
      const repeatCount = consoleOutput.filter((line) => line.includes("[REPEAT]")).length;
      expect(repeatCount).toBeGreaterThan(0);

      // The history file should show count=2 for all violations
      const historyPath = resolve(testDir, ".trust-cli", "history.json");
      const historyRaw = readFileSync(historyPath, "utf-8");
      const history = JSON.parse(historyRaw) as Record<string, ViolationHistoryEntry>;
      for (const entry of Object.values(history)) {
        expect(entry.count).toBeGreaterThanOrEqual(2);
      }
    });

    it("--adaptive flag can appear before --profile", () => {
      const fixturePath = getFixturePath("soc2-2024-known-bad.json");
      const exitCode = complianceCheckCommand([fixturePath, "--adaptive", "--profile", "soc2-2024"]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes("Adaptive weighting: enabled"))).toBe(true);
    });
  });
});
