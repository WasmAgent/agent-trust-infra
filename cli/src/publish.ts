import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateAgentBOM } from "../../packages/agentbom-core/src/index.js";

interface PublishOptions {
  bomPath: string;
  registryUrl: string;
}

interface PublishResponse {
  success: boolean;
  message?: string;
  listing_id?: string;
  error?: string;
}

/**
 * Parse command-line arguments for the publish command.
 * Expected format: publish <bom.json> --registry <url>
 */
function parsePublishArgs(args: string[]): PublishOptions | null {
  if (args.length < 3) {
    return null;
  }

  const bomPath = args[0];
  const registryFlag = args[1];
  const registryUrl = args[2];

  if (registryFlag !== "--registry") {
    console.error(`Error: expected "--registry" flag, got "${registryFlag}"`);
    return null;
  }

  return { bomPath, registryUrl };
}

/**
 * Read and validate an AgentBOM file.
 */
function loadAndValidateAgentBOM(bomPath: string): Record<string, unknown> | null {
  const resolvedBomPath = resolve(bomPath);
  let bomRaw: string;

  try {
    bomRaw = readFileSync(resolvedBomPath, "utf-8");
  } catch {
    console.error(`Error: cannot read AgentBOM file "${resolvedBomPath}"`);
    return null;
  }

  let bomData: unknown;
  try {
    bomData = JSON.parse(bomRaw);
  } catch {
    console.error(`Error: "${resolvedBomPath}" is not valid JSON`);
    return null;
  }

  // Validate AgentBOM schema
  const bomValidation = validateAgentBOM(bomData);
  if (!bomValidation.valid) {
    console.error(`Error: AgentBOM validation failed for "${resolvedBomPath}":`);
    for (const err of bomValidation.errors) {
      console.error(`  - ${err}`);
    }
    return null;
  }

  return bomData as Record<string, unknown>;
}

/**
 * Publish an AgentBOM to a registry.
 */
async function publishToRegistry(
  bomData: Record<string, unknown>,
  registryUrl: string
): Promise<PublishResponse> {
  try {
    // Extract agent_id from the BOM
    const identity = bomData.identity as Record<string, unknown> | undefined;
    const agentId = identity?.agent_id as string | undefined;

    if (!agentId) {
      return {
        success: false,
        error: "AgentBOM missing identity.agent_id field",
      };
    }

    // Prepare the payload - send the full AgentBOM as the listing
    const payload = {
      agentbom: bomData,
      published_at: new Date().toISOString(),
    };

    console.log(`Publishing agent "${agentId}" to registry...`);
    console.log(`Registry URL: ${registryUrl}`);

    const response = await fetch(registryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "@wasmagent/agent-trust-cli",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const responseData = await response.json().catch(() => ({}));
    return {
      success: true,
      message: "Successfully published agent listing",
      listing_id: responseData.listing_id || agentId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Request failed: ${errorMessage}`,
    };
  }
}

/**
 * Main publish command implementation.
 */
export async function publishCommand(args: string[]): Promise<number> {
  const options = parsePublishArgs(args);
  if (!options) {
    console.error("Usage: agent-trust publish <bom.json> --registry <url>");
    console.error("");
    console.error("Arguments:");
    console.error("  <bom.json>    Path to AgentBOM JSON file");
    console.error("  --registry <url>  Registry URL to publish to");
    return 1;
  }

  const { bomPath, registryUrl } = options;

  // Validate registry URL format
  try {
    new URL(registryUrl);
  } catch {
    console.error(`Error: invalid registry URL "${registryUrl}"`);
    return 1;
  }

  // Load and validate AgentBOM
  const bomData = loadAndValidateAgentBOM(bomPath);
  if (!bomData) {
    return 1;
  }

  // Extract agent info for display
  const identity = bomData.identity as Record<string, unknown> | undefined;
  const agentId = identity?.agent_id as string | undefined;
  const agentName = identity?.agent_name as string | undefined;
  const agentVersion = identity?.agent_version as string | undefined;

  console.log("");
  console.log("Agent Information:");
  console.log(`  ID:      ${agentId || "unknown"}`);
  console.log(`  Name:    ${agentName || "unknown"}`);
  console.log(`  Version: ${agentVersion || "unknown"}`);
  console.log("");

  // Publish to registry
  const result = await publishToRegistry(bomData, registryUrl);

  if (result.success) {
    console.log(`✓ ${result.message}`);
    if (result.listing_id) {
      console.log(`  Listing ID: ${result.listing_id}`);
    }
    return 0;
  } else {
    console.error(`✗ Publish failed: ${result.error}`);
    return 1;
  }
}
