# Marketplace Demo

This directory contains example agent listings that demonstrate the end-to-end marketplace flow:

1. **Publication**: Agents are published with trust metadata (AgentBOM, Trust Passport, compliance reports)
2. **Discovery**: Buyers can browse the marketplace to find agents by category, tags, and ratings
3. **Verification**: Buyers can verify the trust chain before downloading an agent

## Example Agents

### Data Analyst Agent
- **Category**: data-analysis
- **Pricing**: freemium ($0/$99)
- **Rating**: ★ 4.5 (89 reviews)
- **Compliance**: SOC2, ISO27001

### Coding Assistant Agent
- **Category**: development
- **Pricing**: paid ($49/month)
- **Rating**: ★ 4.8 (234 reviews)
- **Compliance**: SOC2

### Customer Support Agent
- **Category**: customer-support
- **Pricing**: enterprise
- **Rating**: ★ 4.2 (67 reviews)
- **Compliance**: SOC2, GDPR, HIPAA (partial)

## Demo Flow

```bash
# 1. Browse the marketplace
bun cli/src/index.ts marketplace browse

# 2. Inspect a specific listing
bun cli/src/index.ts marketplace inspect data-analyst/listing.json

# 3. Verify the trust chain before downloading
bun cli/src/index.ts marketplace verify data-analyst/listing.json
```

## Trust Verification

The verification process checks:

1. ✓ **Listing Schema** - conforms to AgentListing v0.1
2. ✓ **AgentBOM Reference** - valid reference to AgentBOM
3. ✓ **AgentBOM Validation** - AgentBOM is valid and matches agent ID
4. ✓ **Trust Passport** - passport is valid and not expired
5. ✓ **Compliance Reports** - compliance status and framework mappings

Based on these checks, a trust score (0-100) is calculated and the agent is marked as:
- **valid** (score ≥ 80): Safe to download
- **warning** (score ≥ 60): Review before downloading
- **invalid** (score < 60): Do not download

## Files Structure

Each agent listing contains:

```
<agent-name>/
├── listing.json          # Marketplace listing with metadata
├── agentbom.json         # AgentBOM (tool inventory, permissions, risks)
├── trust-passport.json   # Trust Passport (trust summary, attestations)
└── posture.json          # MCP Posture (permission graph, tool inventory)
```

## Publishing to Marketplace

To publish an agent to the marketplace:

```bash
# Generate AgentBOM from agent directory
bun cli/src/index.ts agentbom generate --agent <path>

# Create listing.json referencing the AgentBOM
# (Manually create or use listing generator)

# Publish to registry
bun cli/src/index.ts publish agentbom.json --registry <url>
```

## Integration with CI/CD

The marketplace commands integrate with CI/CD pipelines:

```yaml
# .github/workflows/publish.yml
- name: Publish to Marketplace
  run: |
    bun cli/src/index.ts publish agentbom.json --registry ${{ secrets.MARKETPLACE_URL }}
```

## Security Considerations

- All trust artifacts are referenced via URLs and can be from different origins
- Hash verification ensures artifact integrity
- Passport signatures establish trust chain to issuer
- Compliance reports provide third-party validation
