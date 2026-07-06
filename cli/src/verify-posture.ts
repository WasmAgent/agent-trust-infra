import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ManifestTool {
  tool_id: string;
  permissions: string[];
  max_risk_severity: string;
}

interface ManifestServer {
  server_id: string;
  server_name: string;
  allowed_tools: ManifestTool[];
}

interface Manifest {
  manifest_version: string;
  agent_id: string;
  mcp_servers: ManifestServer[];
}

interface PostureTool {
  tool_id: string;
  tool_name: string;
  permissions: string[];
  risk_categories: string[];
  risk_severity: string;
}

interface PostureServer {
  server_id: string;
  server_name: string;
  version: string;
  provenance: string;
  tools: PostureTool[];
}

interface PostureIdentity {
  snapshot_id: string;
  agent_id: string;
  captured_at: string;
}

interface Posture {
  posture_version: string;
  identity: PostureIdentity;
  servers: PostureServer[];
  permission_graph: unknown;
  risk_summary: unknown[];
  drift: unknown;
  attestation: { generator: string };
}

interface Violation {
  type: "unexpected_server" | "unexpected_tool" | "severity_mismatch" | "permission_mismatch";
  server_id: string;
  tool_id?: string;
  expected?: string;
  actual?: string;
  message: string;
}

interface VerificationResult {
  valid: boolean;
  violations: Violation[];
  summary: {
    total_servers: number;
    verified_servers: number;
    unexpected_servers: number;
    total_tools: number;
    verified_tools: number;
    unexpected_tools: number;
  };
}

function loadManifest(path: string): Manifest {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

function loadPosture(path: string): Posture {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw);
  // Basic validation
  if (!parsed.posture_version || !parsed.identity || !Array.isArray(parsed.servers)) {
    throw new Error("Invalid posture file: missing required fields");
  }
  return parsed;
}

function verifyPosture(manifest: Manifest, posture: Posture): VerificationResult {
  const violations: Violation[] = [];
  const manifestServerMap = new Map<string, ManifestServer>();

  for (const server of manifest.mcp_servers) {
    manifestServerMap.set(server.server_id, server);
  }

  const manifestToolMap = new Map<string, Set<string>>();
  for (const server of manifest.mcp_servers) {
    const tools = new Set<string>();
    for (const tool of server.allowed_tools) {
      tools.add(tool.tool_id);
    }
    manifestToolMap.set(server.server_id, tools);
  }

  let totalTools = 0;
  let verifiedTools = 0;

  for (const server of posture.servers) {
    const manifestServer = manifestServerMap.get(server.server_id);

    if (!manifestServer) {
      violations.push({
        type: "unexpected_server",
        server_id: server.server_id,
        message: `Server "${server.server_id}" (${server.server_name}) is not declared in the manifest`
      });
      continue;
    }

    // Verify each tool in the posture
    for (const tool of server.tools) {
      totalTools++;
      const manifestTool = manifestServer.allowed_tools.find(t => t.tool_id === tool.tool_id);

      if (!manifestTool) {
        violations.push({
          type: "unexpected_tool",
          server_id: server.server_id,
          tool_id: tool.tool_id,
          message: `Tool "${tool.tool_id}" on server "${server.server_id}" is not declared in the manifest`
        });
        continue;
      }

      // Verify risk severity
      const severityOrder = ["low", "medium", "high", "critical"];
      const manifestSeverityIdx = severityOrder.indexOf(manifestTool.max_risk_severity);
      const actualSeverityIdx = severityOrder.indexOf(tool.risk_severity);

      if (actualSeverityIdx > manifestSeverityIdx) {
        violations.push({
          type: "severity_mismatch",
          server_id: server.server_id,
          tool_id: tool.tool_id,
          expected: manifestTool.max_risk_severity,
          actual: tool.risk_severity,
          message: `Tool "${tool.tool_id}" has risk severity "${tool.risk_severity}" which exceeds maximum allowed "${manifestTool.max_risk_severity}"`
        });
        continue;
      }

      // Verify permissions (subset check)
      const hasExtraPermissions = tool.permissions.some(p => !manifestTool.permissions.includes(p));
      if (hasExtraPermissions) {
        violations.push({
          type: "permission_mismatch",
          server_id: server.server_id,
          tool_id: tool.tool_id,
          message: `Tool "${tool.tool_id}" has permissions not declared in manifest`
        });
        continue;
      }

      verifiedTools++;
    }
  }

  const unexpectedServers = violations.filter(v => v.type === "unexpected_server").length;
  const unexpectedTools = violations.filter(v => v.type === "unexpected_tool").length;
  const verifiedServers = posture.servers.length - unexpectedServers;

  return {
    valid: violations.length === 0,
    violations,
    summary: {
      total_servers: posture.servers.length,
      verified_servers: verifiedServers,
      unexpected_servers: unexpectedServers,
      total_tools: totalTools,
      verified_tools: verifiedTools,
      unexpected_tools: unexpectedTools
    }
  };
}

export function verifyPostureCommand(manifestPath: string, posturePath?: string): number {
  const resolvedManifestPath = resolve(manifestPath);

  // If posture path not provided, derive it from manifest path
  const resolvedPosturePath = posturePath
    ? resolve(posturePath)
    : resolve(resolve(manifestPath, ".."), "posture.json");

  let manifest: Manifest;
  try {
    manifest = loadManifest(resolvedManifestPath);
  } catch (err) {
    console.error(`Error: cannot load manifest "${resolvedManifestPath}": ${err}`);
    return 1;
  }

  let posture: Posture;
  try {
    posture = loadPosture(resolvedPosturePath);
  } catch (err) {
    console.error(`Error: cannot load posture "${resolvedPosturePath}": ${err}`);
    return 1;
  }

  // Verify agent IDs match
  if (manifest.agent_id !== posture.identity.agent_id) {
    console.error(`Error: agent ID mismatch - manifest "${manifest.agent_id}" vs posture "${posture.identity.agent_id}"`);
    return 1;
  }

  const result = verifyPosture(manifest, posture);

  console.log(`MCP Posture Verification`);
  console.log(`Manifest:  ${resolvedManifestPath}`);
  console.log(`Posture:   ${resolvedPosturePath}`);
  console.log(`Agent ID:  ${manifest.agent_id}`);
  console.log();

  if (result.valid) {
    console.log(`✓ Verification passed`);
    console.log(`  Servers: ${result.summary.verified_servers}/${result.summary.total_servers} verified`);
    console.log(`  Tools: ${result.summary.verified_tools}/${result.summary.total_tools} verified`);
    return 0;
  }

  console.log(`✗ Verification failed`);
  console.log(`  Servers: ${result.summary.verified_servers}/${result.summary.total_servers} verified (${result.summary.unexpected_servers} unexpected)`);
  console.log(`  Tools: ${result.summary.verified_tools}/${result.summary.total_tools} verified (${result.summary.unexpected_tools} unexpected)`);
  console.log();

  console.log(`Violations:`);
  for (const violation of result.violations) {
    console.log(`  - ${violation.message}`);
    if (violation.type === "severity_mismatch") {
      console.log(`    Severity: expected "${violation.expected}", got "${violation.actual}"`);
    }
  }

  return 1;
}
