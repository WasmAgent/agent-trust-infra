import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgentBOM } from "../../packages/agentbom-core/src/index.js";

interface ComplianceResult {
  compliant: boolean;
  profile_id: string;
  framework_name: string;
  framework_version: string;
  errors: string[];
  warnings: string[];
  passed_checks: string[];
}

interface ComplianceProfile {
  profile_version: string;
  profile_id: string;
  framework: {
    name: string;
    version: string;
    description?: string;
  };
  rules: {
    identity?: {
      required_fields?: string[];
      allowed_contexts?: string[];
      requires_version?: boolean;
    };
    tool_layer?: {
      max_severity?: "low" | "medium" | "high" | "critical";
      requires_tool_inventory?: boolean;
      blocked_permissions?: string[];
      blocked_sources?: string[];
    };
    risk_layer?: {
      requires_risk_assessment?: boolean;
      max_unmitigated_critical?: number;
      max_unmitigated_high?: number;
      max_unmitigated_medium?: number;
      requires_mitigation_for?: ("critical" | "high" | "medium" | "low")[];
    };
    attestation?: {
      requires_signature?: boolean;
      requires_timestamp?: boolean;
    };
  };
  metadata?: {
    author?: string;
    created_at?: string;
    updated_at?: string;
    documentation_url?: string;
  };
}

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

function severityLevel(severity: string): number {
  return SEVERITY_ORDER[severity as keyof typeof SEVERITY_ORDER] || 0;
}

function loadProfile(profileId: string): ComplianceProfile | null {
  const profilesDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../profiles",
  );

  const profilePath = resolve(profilesDir, `${profileId}.json`);

  try {
    const raw = readFileSync(profilePath, "utf-8");
    return JSON.parse(raw) as ComplianceProfile;
  } catch {
    return null;
  }
}

function checkIdentity(
  data: Record<string, unknown>,
  profile: ComplianceProfile,
): { errors: string[]; warnings: string[]; passed: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passed: string[] = [];

  const identity = data.identity as Record<string, unknown> | undefined;

  if (!identity) {
    errors.push("identity section is missing");
    return { errors, warnings, passed };
  }

  const rules = profile.rules.identity;
  if (!rules) {
    passed.push("identity: no rules defined");
    return { errors, warnings, passed };
  }

  // Check required fields
  if (rules.required_fields) {
    for (const field of rules.required_fields) {
      if (!(field in identity) || identity[field] === undefined || identity[field] === null) {
        errors.push(`identity: missing required field "${field}"`);
      } else {
        passed.push(`identity: field "${field}" present`);
      }
    }
  }

  // Check allowed contexts
  if (rules.allowed_contexts && rules.allowed_contexts.length > 0) {
    const context = String(identity.deployment_context ?? "");
    if (!rules.allowed_contexts.includes(context)) {
      errors.push(
        `identity: deployment_context "${context}" not in allowed contexts [${rules.allowed_contexts.join(", ")}]`,
      );
    } else {
      passed.push(`identity: deployment_context "${context}" is allowed`);
    }
  }

  // Check version requirement
  if (rules.requires_version) {
    if (!identity.agent_version || String(identity.agent_version).trim() === "") {
      errors.push("identity: agent_version is required but missing or empty");
    } else {
      passed.push(`identity: agent_version "${identity.agent_version}" present`);
    }
  }

  return { errors, warnings, passed };
}

function checkToolLayer(
  data: Record<string, unknown>,
  profile: ComplianceProfile,
): { errors: string[]; warnings: string[]; passed: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passed: string[] = [];

  const toolLayer = data.tool_layer as unknown[] | undefined;

  const rules = profile.rules.tool_layer;
  if (!rules) {
    passed.push("tool_layer: no rules defined");
    return { errors, warnings, passed };
  }

  // Check tool inventory requirement
  if (rules.requires_tool_inventory) {
    if (!toolLayer || toolLayer.length === 0) {
      errors.push("tool_layer: tool inventory is required but missing or empty");
    } else {
      passed.push(`tool_layer: tool inventory present (${toolLayer.length} tools)`);
    }
  }

  if (!toolLayer || toolLayer.length === 0) {
    return { errors, warnings, passed };
  }

  // Check each tool for max severity
  if (rules.max_severity) {
    const maxLevel = severityLevel(rules.max_severity);
    for (const tool of toolLayer) {
      if (typeof tool === "object" && tool !== null) {
        const t = tool as Record<string, unknown>;
        const riskSignals = t.risk_signals as string[] | undefined;
        if (riskSignals) {
          for (const signal of riskSignals) {
            const severity = signal.split(":")[0]?.toLowerCase();
            if (severity && severityLevel(severity) > maxLevel) {
              errors.push(
                `tool_layer: tool "${t.tool_name}" has risk signal "${signal}" exceeding max severity "${rules.max_severity}"`,
              );
            }
          }
        }
      }
    }
    if (errors.filter((e) => e.startsWith("tool_layer: tool")).length === 0) {
      passed.push(`tool_layer: all tools within max severity "${rules.max_severity}"`);
    }
  }

  // Check blocked permissions
  if (rules.blocked_permissions && rules.blocked_permissions.length > 0) {
    for (const tool of toolLayer) {
      if (typeof tool === "object" && tool !== null) {
        const t = tool as Record<string, unknown>;
        const permissions = t.permissions as string[] | undefined;
        if (permissions) {
          for (const perm of permissions) {
            for (const blocked of rules.blocked_permissions!) {
              if (perm.toLowerCase().includes(blocked.toLowerCase())) {
                errors.push(
                  `tool_layer: tool "${t.tool_name}" has blocked permission "${perm}" (matches "${blocked}")`,
                );
              }
            }
          }
        }
      }
    }
  }

  // Check blocked sources
  if (rules.blocked_sources && rules.blocked_sources.length > 0) {
    for (const tool of toolLayer) {
      if (typeof tool === "object" && tool !== null) {
        const t = tool as Record<string, unknown>;
        const source = String(t.source ?? "");
        for (const blocked of rules.blocked_sources!) {
          if (source.toLowerCase().includes(blocked.toLowerCase())) {
            errors.push(`tool_layer: tool "${t.tool_name}" has blocked source "${source}"`);
          }
        }
      }
    }
  }

  if (errors.filter((e) => e.startsWith("tool_layer:")).length === 0) {
    passed.push("tool_layer: no blocked permissions or sources found");
  }

  return { errors, warnings, passed };
}

function checkRiskLayer(
  data: Record<string, unknown>,
  profile: ComplianceProfile,
): { errors: string[]; warnings: string[]; passed: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passed: string[] = [];

  const riskLayer = data.risk_layer as unknown[] | undefined;

  const rules = profile.rules.risk_layer;
  if (!rules) {
    passed.push("risk_layer: no rules defined");
    return { errors, warnings, passed };
  }

  // Check risk assessment requirement
  if (rules.requires_risk_assessment) {
    if (!riskLayer || riskLayer.length === 0) {
      errors.push("risk_layer: risk assessment is required but missing or empty");
    } else {
      passed.push(`risk_layer: risk assessment present (${riskLayer.length} risks)`);
    }
  }

  if (!riskLayer || riskLayer.length === 0) {
    return { errors, warnings, passed };
  }

  // Count unmitigated risks by severity
  const unmitigatedCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const risk of riskLayer) {
    if (typeof risk === "object" && risk !== null) {
      const r = risk as Record<string, unknown>;
      const severity = String(r.severity ?? "").toLowerCase();
      const status = String(r.status ?? "").toLowerCase();

      if (status !== "mitigated" && status !== "accepted") {
        if (severity in unmitigatedCounts) {
          unmitigatedCounts[severity]++;
        }
      }
    }
  }

  // Check max unmitigated critical
  if (rules.max_unmitigated_critical !== undefined) {
    const count = unmitigatedCounts.critical;
    if (count > rules.max_unmitigated_critical) {
      errors.push(
        `risk_layer: ${count} unmitigated critical risks (max allowed: ${rules.max_unmitigated_critical})`,
      );
    } else {
      passed.push(`risk_layer: unmitigated critical risks within limit (${count}/${rules.max_unmitigated_critical})`);
    }
  }

  // Check max unmitigated high
  if (rules.max_unmitigated_high !== undefined) {
    const count = unmitigatedCounts.high;
    if (count > rules.max_unmitigated_high) {
      errors.push(
        `risk_layer: ${count} unmitigated high risks (max allowed: ${rules.max_unmitigated_high})`,
      );
    } else {
      passed.push(`risk_layer: unmitigated high risks within limit (${count}/${rules.max_unmitigated_high})`);
    }
  }

  // Check max unmitigated medium
  if (rules.max_unmitigated_medium !== undefined) {
    const count = unmitigatedCounts.medium;
    if (count > rules.max_unmitigated_medium) {
      errors.push(
        `risk_layer: ${count} unmitigated medium risks (max allowed: ${rules.max_unmitigated_medium})`,
      );
    } else {
      passed.push(`risk_layer: unmitigated medium risks within limit (${count}/${rules.max_unmitigated_medium})`);
    }
  }

  // Check mitigation requirements
  if (rules.requires_mitigation_for && rules.requires_mitigation_for.length > 0) {
    for (const risk of riskLayer) {
      if (typeof risk === "object" && risk !== null) {
        const r = risk as Record<string, unknown>;
        const severity = String(r.severity ?? "").toLowerCase();
        const status = String(r.status ?? "").toLowerCase();

        if (rules.requires_mitigation_for!.includes(severity as any)) {
          if (status !== "mitigated" && status !== "accepted") {
            warnings.push(
              `risk_layer: risk "${r.risk_id}" has severity "${severity}" without mitigation status`,
            );
          }
        }
      }
    }
  }

  return { errors, warnings, passed };
}

function checkAttestation(
  data: Record<string, unknown>,
  profile: ComplianceProfile,
): { errors: string[]; warnings: string[]; passed: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passed: string[] = [];

  const attestation = data.attestation as Record<string, unknown> | undefined;

  if (!attestation) {
    errors.push("attestation section is missing");
    return { errors, warnings, passed };
  }

  const rules = profile.rules.attestation;
  if (!rules) {
    passed.push("attestation: no rules defined");
    return { errors, warnings, passed };
  }

  // Check signature requirement
  if (rules.requires_signature) {
    const signature = attestation.signature;
    if (!signature || String(signature).trim() === "") {
      errors.push("attestation: signature is required but missing or empty");
    } else {
      passed.push("attestation: signature present");
    }
  }

  // Check timestamp requirement
  if (rules.requires_timestamp) {
    const timestamp = attestation.timestamp;
    if (!timestamp || String(timestamp).trim() === "") {
      errors.push("attestation: timestamp is required but missing or empty");
    } else {
      passed.push("attestation: timestamp present");
    }
  }

  return { errors, warnings, passed };
}

export function complianceCheckCommand(args: string[]): number {
  if (args.length < 3) {
    console.error("Usage: agent-trust compliance-check <bom.json> --profile <name>");
    console.error("");
    console.error("Available profiles:");
    console.error("  soc2-2024       SOC 2 Type II compliance (2024)");
    console.error("  iso27001-2022   ISO/IEC 27001:2022 compliance");
    console.error("  eidas-controlled eIDAS controlled digital identity services");
    return 1;
  }

  const bomPath = args[0];
  const profileArg = args[1];

  if (profileArg !== "--profile") {
    console.error(`Error: expected "--profile" argument, got "${profileArg}"`);
    return 1;
  }

  const profileId = args[2];

  // Load AgentBOM
  const resolvedBomPath = resolve(bomPath);
  let bomRaw: string;
  try {
    bomRaw = readFileSync(resolvedBomPath, "utf-8");
  } catch {
    console.error(`Error: cannot read AgentBOM file "${resolvedBomPath}"`);
    return 1;
  }

  let bomData: unknown;
  try {
    bomData = JSON.parse(bomRaw);
  } catch {
    console.error(`Error: "${resolvedBomPath}" is not valid JSON`);
    return 1;
  }

  // Validate AgentBOM schema
  const bomValidation = validateAgentBOM(bomData);
  if (!bomValidation.valid) {
    console.error(`Error: AgentBOM validation failed for "${resolvedBomPath}":`);
    for (const err of bomValidation.errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  // Load compliance profile
  const profile = loadProfile(profileId);
  if (!profile) {
    console.error(`Error: cannot load compliance profile "${profileId}"`);
    console.error(`Expected file: profiles/${profileId}.json`);
    return 1;
  }

  // Run compliance checks
  const result: ComplianceResult = {
    compliant: true,
    profile_id: profile.profile_id,
    framework_name: profile.framework.name,
    framework_version: profile.framework.version,
    errors: [],
    warnings: [],
    passed_checks: [],
  };

  const checks = [
    checkIdentity(bomData as Record<string, unknown>, profile),
    checkToolLayer(bomData as Record<string, unknown>, profile),
    checkRiskLayer(bomData as Record<string, unknown>, profile),
    checkAttestation(bomData as Record<string, unknown>, profile),
  ];

  for (const check of checks) {
    result.errors.push(...check.errors);
    result.warnings.push(...check.warnings);
    result.passed_checks.push(...check.passed);
  }

  result.compliant = result.errors.length === 0;

  // Output results
  console.log(`Compliance Check: ${profile.framework.name} ${profile.framework.version}`);
  console.log(`Profile: ${profile.profile_id}`);
  console.log(`AgentBOM: ${resolvedBomPath}`);
  console.log("");

  if (result.passed_checks.length > 0) {
    console.log("✓ Passed checks:");
    for (const check of result.passed_checks) {
      console.log(`  ${check}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log("⚠ Warnings:");
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
    console.log("");
  }

  if (result.errors.length > 0) {
    console.log("✗ Failed checks:");
    for (const error of result.errors) {
      console.log(`  ${error}`);
    }
    console.log("");
  }

  if (result.compliant) {
    console.log("✓ COMPLIANT: All checks passed");
    return 0;
  } else {
    console.log("✗ NON-COMPLIANT: Some checks failed");
    return 1;
  }
}
