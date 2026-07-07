import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateAgentBOM } from "../../packages/agentbom-core/src/index.js";
import {
  inspectTrustPassport,
  isExpired,
  validateTrustPassport,
} from "../../packages/trust-passport-core/src/index.js";

interface MarketplaceOptions {
  action: "browse" | "verify" | "inspect";
  listingPath?: string;
  registryPath?: string;
}

interface AgentListing {
  listing_version: string;
  agent_id: string;
  metadata: {
    name: string;
    tagline?: string;
    description: string;
    version: string;
    author: {
      name: string;
      email?: string;
      website?: string;
    };
    repository?: string;
    homepage?: string;
  };
  discovery: {
    category: string;
    tags: string[];
    keywords?: string[];
    screenshots?: Array<{
      url: string;
      caption?: string;
      type: "image" | "video" | "demo";
    }>;
  };
  marketplace: {
    pricing?: {
      model: "free" | "paid" | "freemium" | "enterprise";
      amount?: string;
      currency?: string;
    };
    license: string;
    downloads?: {
      total?: number;
      this_month?: number;
    };
    rating?: {
      average?: number;
      count?: number;
    };
  };
  trust_artifacts: {
    agentbom: {
      url: string;
      hash?: string;
    };
    trust_passport?: {
      url: string;
      issuer?: string;
    };
    compliance_reports?: Array<{
      framework: string;
      url: string;
      status: "compliant" | "partial" | "non-compliant" | "pending";
    }>;
  };
  publication: {
    publisher: {
      name: string;
      did?: string;
      email?: string;
    };
    published_at: string;
    updated_at: string;
    status: "published" | "archived" | "deprecated" | "pending-review";
  };
  attestation?: {
    listing_hash?: string;
    signature?: string;
    signature_algorithm?: string;
    verification_url?: string;
  };
}

interface VerificationResult {
  valid: boolean;
  steps: Array<{
    name: string;
    status: "valid" | "invalid" | "warning";
    message: string;
  }>;
  summary: {
    overall: "valid" | "invalid" | "warning";
    trust_score: number;
  };
}

/**
 * Parse command-line arguments for the marketplace command.
 */
function parseMarketplaceArgs(args: string[]): MarketplaceOptions | null {
  if (args.length === 0) {
    return { action: "browse" };
  }

  const action = args[0];
  if (action === "browse" && args.length === 1) {
    return { action: "browse" };
  }

  if (action === "inspect" && args.length >= 2) {
    return { action: "inspect", listingPath: args[1] };
  }

  if (action === "verify" && args.length >= 2) {
    return { action: "verify", listingPath: args[1] };
  }

  return null;
}

/**
 * Load an AgentListing from a JSON file.
 */
function loadListing(path: string): AgentListing | null {
  try {
    const resolvedPath = resolve(path);
    const content = readFileSync(resolvedPath, "utf-8");
    const data = JSON.parse(content) as unknown;

    // Basic validation
    if (typeof data !== "object" || data === null) {
      console.error(`Error: "${resolvedPath}" is not a valid JSON object`);
      return null;
    }

    const listing = data as AgentListing;
    if (listing.listing_version !== "0.1") {
      console.error(`Error: unsupported listing version "${listing.listing_version}"`);
      return null;
    }

    return listing;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Browse marketplace: show all available listings.
 */
function browseMarketplace(): number {
  console.log("🏪 Agent Marketplace");
  console.log("");
  console.log("Available listings:");
  console.log("");

  const examplesDir = resolve(__dirname, "../../examples");
  const listingDirs = [
    "marketplace-demo/data-analyst",
    "marketplace-demo/coding-assistant",
    "marketplace-demo/customer-support"
  ];

  let foundCount = 0;

  for (const dir of listingDirs) {
    const listingPath = resolve(examplesDir, dir, "listing.json");
    try {
      const listing = loadListing(listingPath);
      if (listing) {
        foundCount++;
        const pricing = listing.marketplace.pricing?.model || "free";
        const rating = listing.marketplace.rating?.average
          ? `★ ${listing.marketplace.rating.average.toFixed(1)}`
          : "★ Unrated";
        const downloads = listing.marketplace.downloads?.total || 0;

        console.log(`📦 ${listing.metadata.name} v${listing.metadata.version}`);
        console.log(`   ${listing.metadata.tagline || listing.metadata.description.substring(0, 80)}...`);
        console.log(`   Category: ${listing.discovery.category} | Tags: ${listing.discovery.tags.join(", ")}`);
        console.log(`   Pricing: ${pricing} | ${rating} | ↓ ${downloads} downloads`);
        console.log(`   Agent ID: ${listing.agent_id}`);
        console.log("");
        console.log(`   Verify trust chain:`);
        console.log(`     agent-trust marketplace verify ${listingPath}`);
        console.log("");
      }
    } catch {
      // Skip missing listings
    }
  }

  if (foundCount === 0) {
    console.log("No listings found. Create example listings in examples/marketplace-demo/");
  }

  console.log("");
  console.log("Commands:");
  console.log("  agent-trust marketplace inspect <listing.json>  View full listing details");
  console.log("  agent-trust marketplace verify <listing.json>   Verify trust chain");
  console.log("");

  return 0;
}

/**
 * Inspect a marketplace listing: show full details.
 */
function inspectListing(listing: AgentListing): number {
  console.log("📦 Agent Listing");
  console.log("");

  console.log("Metadata:");
  console.log(`  Name: ${listing.metadata.name}`);
  console.log(`  Version: ${listing.metadata.version}`);
  console.log(`  Tagline: ${listing.metadata.tagline || "N/A"}`);
  console.log(`  Description: ${listing.metadata.description}`);
  console.log(`  Author: ${listing.metadata.author.name} ${listing.metadata.author.email ? `<${listing.metadata.author.email}>` : ""}`);
  if (listing.metadata.repository) {
    console.log(`  Repository: ${listing.metadata.repository}`);
  }
  if (listing.metadata.homepage) {
    console.log(`  Homepage: ${listing.metadata.homepage}`);
  }
  console.log("");

  console.log("Discovery:");
  console.log(`  Category: ${listing.discovery.category}`);
  console.log(`  Tags: ${listing.discovery.tags.join(", ")}`);
  if (listing.discovery.keywords && listing.discovery.keywords.length > 0) {
    console.log(`  Keywords: ${listing.discovery.keywords.join(", ")}`);
  }
  console.log("");

  console.log("Marketplace:");
  const pricing = listing.marketplace.pricing;
  if (pricing) {
    console.log(`  Pricing Model: ${pricing.model}`);
    if (pricing.amount) {
      console.log(`  Price: ${pricing.amount}${pricing.currency ? ` ${pricing.currency}` : ""}`);
    }
  } else {
    console.log(`  Pricing Model: free`);
  }
  console.log(`  License: ${listing.marketplace.license}`);
  if (listing.marketplace.downloads) {
    console.log(`  Downloads: ${listing.marketplace.downloads.total} total, ${listing.marketplace.downloads.this_month} this month`);
  }
  if (listing.marketplace.rating) {
    console.log(`  Rating: ★ ${listing.marketplace.rating.average.toFixed(1)} (${listing.marketplace.rating.count} reviews)`);
  }
  console.log("");

  console.log("Trust Artifacts:");
  console.log(`  AgentBOM: ${listing.trust_artifacts.agentbom.url}`);
  if (listing.trust_artifacts.agentbom.hash) {
    console.log(`    Hash: ${listing.trust_artifacts.agentbom.hash}`);
  }
  if (listing.trust_artifacts.trust_passport) {
    console.log(`  Trust Passport: ${listing.trust_artifacts.trust_passport.url}`);
    if (listing.trust_artifacts.trust_passport.issuer) {
      console.log(`    Issuer: ${listing.trust_artifacts.trust_passport.issuer}`);
    }
  }
  if (listing.trust_artifacts.compliance_reports && listing.trust_artifacts.compliance_reports.length > 0) {
    console.log(`  Compliance Reports:`);
    for (const report of listing.trust_artifacts.compliance_reports) {
      console.log(`    - ${report.framework}: ${report.status} (${report.url})`);
    }
  }
  console.log("");

  console.log("Publication:");
  console.log(`  Publisher: ${listing.publication.publisher.name}`);
  if (listing.publication.publisher.did) {
    console.log(`  Publisher DID: ${listing.publication.publisher.did}`);
  }
  if (listing.publication.publisher.email) {
    console.log(`  Publisher Email: ${listing.publication.publisher.email}`);
  }
  console.log(`  Published: ${listing.publication.published_at}`);
  console.log(`  Updated: ${listing.publication.updated_at}`);
  console.log(`  Status: ${listing.publication.status}`);
  console.log("");

  console.log("Agent ID:");
  console.log(`  ${listing.agent_id}`);
  console.log("");

  return 0;
}

/**
 * Verify trust chain for a marketplace listing.
 * This is the core "buyer verifies trust chain before download" flow.
 */
function verifyListing(listing: AgentListing): number {
  console.log("🔍 Verifying Trust Chain");
  console.log("");
  console.log(`Agent: ${listing.metadata.name} (${listing.agent_id})`);
  console.log("");

  const steps: VerificationResult["steps"] = [];
  let trustScore = 0;

  // Step 1: Verify listing schema and structure
  steps.push({
    name: "Listing Schema",
    status: listing.listing_version === "0.1" ? "valid" : "invalid",
    message: listing.listing_version === "0.1"
      ? "Listing conforms to AgentListing v0.1 schema"
      : `Unsupported listing version: ${listing.listing_version}`,
  });
  if (listing.listing_version === "0.1") trustScore += 20;

  // Step 2: Verify AgentBOM reference exists
  const hasAgentBOM = !!listing.trust_artifacts.agentbom.url;
  steps.push({
    name: "AgentBOM Reference",
    status: hasAgentBOM ? "valid" : "invalid",
    message: hasAgentBOM
      ? `AgentBOM referenced: ${listing.trust_artifacts.agentbom.url}`
      : "Missing AgentBOM reference",
  });
  if (hasAgentBOM) trustScore += 20;

  // Step 3: Try to load and validate the referenced AgentBOM
  const bomPath = listing.trust_artifacts.agentbom.url.replace("file://", "");
  let bomValid = false;
  try {
    const bomContent = readFileSync(bomPath, "utf-8");
    const bomData = JSON.parse(bomContent);
    const bomValidation = validateAgentBOM(bomData);
    bomValid = bomValidation.valid;

    if (bomValid) {
      steps.push({
        name: "AgentBOM Validation",
        status: "valid",
        message: `AgentBOM is valid and matches agent ID ${listing.agent_id}`,
      });
      trustScore += 20;
    } else {
      steps.push({
        name: "AgentBOM Validation",
        status: "invalid",
        message: `AgentBOM validation failed: ${bomValidation.errors.join(", ")}`,
      });
    }
  } catch (error) {
    steps.push({
      name: "AgentBOM Validation",
      status: "warning",
      message: `Could not load AgentBOM from ${bomPath}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // Step 4: Verify Trust Passport if present
  if (listing.trust_artifacts.trust_passport) {
    const passportPath = listing.trust_artifacts.trust_passport.url.replace("file://", "");
    try {
      const passportContent = readFileSync(passportPath, "utf-8");
      const passportData = JSON.parse(passportContent);
      const passportValidation = validateTrustPassport(passportData);

      if (passportValidation.valid) {
        const expired = isExpired(passportData);
        if (expired) {
          steps.push({
            name: "Trust Passport",
            status: "invalid",
            message: "Trust Passport has expired",
          });
        } else {
          steps.push({
            name: "Trust Passport",
            status: "valid",
            message: `Trust Passport is valid (issuer: ${listing.trust_artifacts.trust_passport.issuer || "unknown"})`,
          });
          trustScore += 20;
        }
      } else {
        steps.push({
          name: "Trust Passport",
          status: "invalid",
          message: `Trust Passport validation failed: ${passportValidation.errors.join(", ")}`,
        });
      }
    } catch (error) {
      steps.push({
        name: "Trust Passport",
        status: "warning",
        message: `Could not load Trust Passport from ${passportPath}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  } else {
    steps.push({
      name: "Trust Passport",
      status: "warning",
      message: "No Trust Passport referenced (recommended but not required)",
    });
  }

  // Step 5: Check compliance reports
  const hasCompliance = listing.trust_artifacts.compliance_reports &&
                        listing.trust_artifacts.compliance_reports.length > 0;
  if (hasCompliance) {
    const compliantCount = listing.trust_artifacts.compliance_reports!.filter(r => r.status === "compliant").length;
    steps.push({
      name: "Compliance Reports",
      status: "valid",
      message: `${compliantCount}/${listing.trust_artifacts.compliance_reports!.length} compliance reports show compliant status`,
    });
    trustScore += Math.floor((compliantCount / listing.trust_artifacts.compliance_reports!.length) * 20);
  } else {
    steps.push({
      name: "Compliance Reports",
      status: "warning",
      message: "No compliance reports referenced",
    });
  }

  // Print verification steps
  for (const step of steps) {
    const icon = step.status === "valid" ? "✓" : step.status === "invalid" ? "✗" : "⚠";
    const statusColor = step.status === "valid" ? "\x1b[32m" : step.status === "invalid" ? "\x1b[31m" : "\x1b[33m";
    const reset = "\x1b[0m";
    console.log(`${statusColor}${icon}${reset} ${step.name}: ${step.message}`);
  }
  console.log("");

  // Overall verdict
  const overallStatus: VerificationResult["summary"]["overall"] =
    trustScore >= 80 ? "valid" : trustScore >= 60 ? "warning" : "invalid";

  console.log(`Trust Score: ${trustScore}/100`);
  console.log(`Overall Status: ${overallStatus.toUpperCase()}`);
  console.log("");

  if (overallStatus === "valid") {
    console.log("✅ Trust chain verified successfully. This agent is safe to download.");
    console.log("");
    console.log("Next steps:");
    console.log(`  1. Review the AgentBOM: ${listing.trust_artifacts.agentbom.url}`);
    if (listing.trust_artifacts.trust_passport) {
      console.log(`  2. Review the Trust Passport: ${listing.trust_artifacts.trust_passport.url}`);
    }
    console.log(`  3. Download and deploy the agent`);
    console.log("");
    return 0;
  } else if (overallStatus === "warning") {
    console.log("⚠️  Trust chain verified with warnings. Review before downloading.");
    console.log("");
    console.log("Warnings to address:");
    steps.filter(s => s.status === "warning").forEach(step => {
      console.log(`  - ${step.name}: ${step.message}`);
    });
    console.log("");
    return 1;
  } else {
    console.log("❌ Trust chain verification failed. DO NOT download this agent.");
    console.log("");
    console.log("Critical issues:");
    steps.filter(s => s.status === "invalid").forEach(step => {
      console.log(`  - ${step.name}: ${step.message}`);
    });
    console.log("");
    return 1;
  }
}

/**
 * Main marketplace command implementation.
 */
export async function marketplaceCommand(args: string[]): Promise<number> {
  const options = parseMarketplaceArgs(args);
  if (!options) {
    console.error("Usage: agent-trust marketplace [browse|inspect|verify] [args]");
    console.error("");
    console.error("Commands:");
    console.error("  agent-trust marketplace browse                    List all available agents");
    console.error("  agent-trust marketplace inspect <listing.json>     View full listing details");
    console.error("  agent-trust marketplace verify <listing.json>      Verify trust chain before download");
    return 1;
  }

  if (options.action === "browse") {
    return browseMarketplace();
  }

  if (options.action === "inspect" && options.listingPath) {
    const listing = loadListing(options.listingPath);
    if (!listing) {
      return 1;
    }
    return inspectListing(listing);
  }

  if (options.action === "verify" && options.listingPath) {
    const listing = loadListing(options.listingPath);
    if (!listing) {
      return 1;
    }
    return verifyListing(listing);
  }

  return 1;
}
