# AgentListing v0.1 Specification

> Status: research preview specification. The schema and reference marketplace format for publishing discoverable agents with trust metadata.

## What is AgentListing?

AgentListing is a marketplace listing format for AI agents that combines discoverable metadata with trust transparency.

It extends the marketplace concept with verifiable trust claims by linking to AgentBOM, Trust Passport, and compliance artifacts. This enables procurement teams, platform operators, and end users to discover, evaluate, and acquire agents with full visibility into their security posture, risk profile, and trust chain.

## Relationship to AgentBOM

AgentListing is the marketplace-facing view of an agent, while AgentBOM is the technical bill of materials. Think of AgentListing as the "product page" and AgentBOM as the "ingredient label":

- **AgentListing**: Public metadata for discovery (name, description, category, tags, pricing, screenshots)
- **AgentBOM**: Technical inventory for trust assessment (tools, permissions, risks, evidence)
- **Trust Passport**: Consumer-facing trust summary (risk rating, compliance status, attestations)

The listing references but does not duplicate the AgentBOM. This separation allows marketplace operators to host lightweight discovery metadata while linking out to heavy trust artifacts stored elsewhere.

## Marketplace workflow

A typical marketplace workflow:

1. **Publication**: Agent publisher creates AgentListing with references to AgentBOM and Trust Passport
2. **Validation**: Marketplace validates listing against AgentListing schema and verifies trust artifact links
3. **Discovery**: Buyers search and browse listings by category, tags, trust rating
4. **Evaluation**: Buyer reviews agent description, screenshots, pricing, and clicks through to trust artifacts
5. **Acquisition**: Buyer downloads or deploys agent with verified trust chain

## Schema structure

```
AgentListing v0.1
├── listing_version  — schema version identifier
├── agent_id         — unique agent identifier (matches AgentBOM)
├── metadata         — name, description, version, author
├── discovery        — category, tags, keywords, screenshots
├── marketplace      — pricing, downloads, rating, license
├── trust_artifacts  — links to AgentBOM, Trust Passport, compliance reports
├── publication      — publisher info, timestamps, listing status
└── attestation      — listing signature, hash, verification endpoints
```

## listing_version

| Field | Type | Required | Description |
|---|---|---|---|
| `listing_version` | string | yes | Always `"0.1"` |

## agent_id

| Field | Type | Required | Description |
|---|---|---|---|
| `agent_id` | string | yes | Unique agent identifier (MUST match `identity.agent_id` in referenced AgentBOM) |

## metadata

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable agent name |
| `tagline` | string | no | One-line summary (≤ 100 chars) |
| `description` | string | yes | Full description (markdown supported) |
| `version` | string | yes | Semantic version |
| `author` | object | yes | Author/publisher information |
| `author.name` | string | yes | Author or organization name |
| `author.email` | string | no | Contact email |
| `author.website` | string | no | Author website URL |
| `repository` | string | no | Source code repository URL |
| `homepage` | string | no | Agent homepage or documentation URL |

## discovery

| Field | Type | Required | Description |
|---|---|---|---|
| `category` | string | yes | Primary category (e.g., `data-analysis`, `automation`, `customer-support`) |
| `tags` | string[] | yes | Searchable tags |
| `keywords` | string[] | no | Additional search keywords |
| `screenshots` | object[] | no | Screenshots and demo media |
| `screenshots[].url` | string | yes | Screenshot or media URL |
| `screenshots[].caption` | string | no | Alt text or caption |
| `screenshots[].type` | string | yes | Media type: `image`, `video`, `demo` |

## marketplace

| Field | Type | Required | Description |
|---|---|---|---|
| `pricing` | object | no | Pricing and licensing information |
| `pricing.model` | string | yes | `free`, `paid`, `freemium`, `enterprise` |
| `pricing.amount` | string | no | Price (e.g., `$99/month`, `$0.01/call`) |
| `pricing.currency` | string | no | ISO 4217 currency code |
| `license` | string | yes | License type (e.g., `MIT`, `Apache-2.0`, `PROPRIETARY`) |
| `downloads` | object | no | Download and installation information |
| `downloads.total` | integer | no | Total download count |
| `downloads.this_month` | integer | no | Downloads this month |
| `rating` | object | no | Community rating |
| `rating.average` | number | no | Average rating (0-5) |
| `rating.count` | integer | no | Number of ratings |

## trust_artifacts

| Field | Type | Required | Description |
|---|---|---|---|
| `agentbom` | object | yes | Link to AgentBOM |
| `agentbom.url` | string | yes | AgentBOM JSON URL |
| `agentbom.hash` | string | no | SHA-256 hash for verification |
| `trust_passport` | object | no | Link to Trust Passport |
| `trust_passport.url` | string | yes | Trust Passport URL (signed JWT) |
| `trust_passport.issuer` | string | no | Passport issuer DID or URL |
| `compliance_reports` | object[] | no | Compliance mappings and attestations |
| `compliance_reports[].framework` | string | yes | Framework name (e.g., `SOC2`, `ISO27001`) |
| `compliance_reports[].url` | string | yes | Compliance report PDF or JSON URL |
| `compliance_reports[].status` | string | yes | `compliant`, `partial`, `non-compliant`, `pending` |

## publication

| Field | Type | Required | Description |
|---|---|---|---|
| `publisher` | object | yes | Marketplace publisher information |
| `publisher.name` | string | yes | Publisher name |
| `publisher.did` | string | no | Publisher decentralized identifier |
| `publisher.email` | string | no | Publisher contact email |
| `published_at` | ISO 8601 | yes | First publication timestamp |
| `updated_at` | ISO 8601 | yes | Last update timestamp |
| `status` | string | yes | `published`, `archived`, `deprecated`, `pending-review` |

## attestation

| Field | Type | Required | Description |
|---|---|---|---|
| `listing_hash` | string | no | SHA-256 of canonical listing JSON |
| `signature` | string | no | Publisher signature over listing_hash |
| `signature_algorithm` | string | no | Algorithm used (e.g., `rsa-pkcs1-sha256`, `ecdsa-secp256k1`) |
| `verification_url` | string | no | Endpoint to verify listing and trust artifacts |

## Validation rules

The following validation rules apply:

1. **agent_id consistency**: The `agent_id` MUST match the `identity.agent_id` in the referenced AgentBOM
2. **URL accessibility**: All URLs in `trust_artifacts` MUST be accessible and return valid artifacts
3. **Hash verification**: If hashes are provided, they MUST match the fetched artifacts
4. **Signature verification**: If signature is provided, it MUST verify with publisher's public key
5. **Markdown safety**: Description field MUST sanitize dangerous HTML (script tags, iframes, etc.)

## CLI commands

```bash
agent-trust listing validate <path>         # Validate AgentListing against schema
agent-trust listing inspect <path>          # Human-readable summary
agent-trust listing publish <bom.json>       # Generate listing from AgentBOM
agent-trust listing verify <listing.json>    # Verify listing signature and trust artifact links
```

## Example listing

```json
{
  "listing_version": "0.1",
  "agent_id": "wasmagent/data-analyst-v1",
  "metadata": {
    "name": "Data Analyst Agent",
    "tagline": "Automated data analysis and reporting for business intelligence",
    "description": "A comprehensive agent for data analysis...",
    "version": "1.2.0",
    "author": {
      "name": "WasmAgent Corp",
      "email": "contact@wasmagent.com",
      "website": "https://wasmagent.com"
    },
    "repository": "https://github.com/WasmAgent/data-analyst",
    "homepage": "https://wasmagent.com/data-analyst"
  },
  "discovery": {
    "category": "data-analysis",
    "tags": ["analytics", "reporting", "business-intelligence", "csv"],
    "keywords": ["data", "analysis", "charts", "excel"],
    "screenshots": [
      {
        "url": "https://wasmagent.com/data-analyst/screenshot1.png",
        "caption": "Dashboard view showing data analysis results",
        "type": "image"
      }
    ]
  },
  "marketplace": {
    "pricing": {
      "model": "freemium",
      "amount": "$0/$99",
      "currency": "USD"
    },
    "license": "PROPRIETARY",
    "downloads": {
      "total": 1250,
      "this_month": 342
    },
    "rating": {
      "average": 4.5,
      "count": 89
    }
  },
  "trust_artifacts": {
    "agentbom": {
      "url": "https://wasmagent.com/data-analyst/agentbom.json",
      "hash": "a1b2c3d4..."
    },
    "trust_passport": {
      "url": "https://wasmagent.com/data-analyst/passport.jwt",
      "issuer": "did:web:wasmagent.com"
    },
    "compliance_reports": [
      {
        "framework": "SOC2",
        "url": "https://wasmagent.com/data-analyst/soc2-report.pdf",
        "status": "compliant"
      }
    ]
  },
  "publication": {
    "publisher": {
      "name": "WasmAgent Marketplace",
      "did": "did:web:marketplace.wasmagent.com",
      "email": "marketplace@wasmagent.com"
    },
    "published_at": "2025-03-15T10:30:00Z",
    "updated_at": "2025-07-01T14:22:00Z",
    "status": "published"
  },
  "attestation": {
    "listing_hash": "e5f6g7h8...",
    "signature": "MEUCIH...",
    "signature_algorithm": "rsa-pkcs1-sha256",
    "verification_url": "https://marketplace.wasmagent.com/verify/wasmagent/data-analyst-v1"
  }
}
```

## JSON Schema

A JSON Schema for validation is published alongside this specification at `specs/agentbom/agent-listing-schema.json`.
