# Compliance Profile Authoring Guide

This guide explains how to create, test, and distribute custom compliance profiles for the WasmAgent Agent Trust Infrastructure. Compliance profiles define validation rules that check AgentBOM artifacts against specific regulatory frameworks or organizational policies.

## Overview

A **Compliance Profile** is a JSON document that maps trust artifacts (AgentBOM, MCP Posture, Trust Passport) to compliance requirements. Profiles enable organizations to:

- Enforce regulatory standards (SOC2, ISO27001, EIDAS, etc.)
- Implement custom security policies
- Validate agent compliance before deployment
- Generate compliance evidence for audits

Profiles are used by the `trust-cli compliance-check` command to validate artifacts against specific frameworks.

## Profile Structure

All compliance profiles follow the `ComplianceProfile` schema (version 0.1). The structure has four main sections:

```json
{
  "profile_version": "0.1",
  "profile_id": "my-custom-profile",
  "framework": {
    "name": "Custom Policy",
    "version": "1.0",
    "description": "Organization-specific compliance requirements"
  },
  "rules": {
    "identity": { /* ... */ },
    "tool_layer": { /* ... */ },
    "risk_layer": { /* ... */ },
    "attestation": { /* ... */ }
  },
  "metadata": {
    "author": "Your Organization",
    "created_at": "2026-07-07T00:00:00Z",
    "updated_at": "2026-07-07T00:00:00Z",
    "documentation_url": "https://example.com/docs"
  }
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `profile_version` | string | Must be `"0.1"` (schema version) |
| `profile_id` | string | Unique identifier (e.g., `"soc2-2024"`) |
| `framework.name` | string | Framework or policy name |
| `framework.version` | string | Framework version |
| `rules.identity` | object | Identity validation rules |
| `rules.tool_layer` | object | Tool capability rules |
| `rules.risk_layer` | object | Risk assessment rules |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `framework.description` | string | Human-readable framework description |
| `rules.attestation` | object | Attestation requirements |
| `metadata` | object | Profile metadata (author, dates, links) |

## Rule Categories

### 1. Identity Rules

Control agent identification and deployment context:

```json
"identity": {
  "required_fields": ["agent_version", "deployment_context"],
  "allowed_contexts": ["production", "staging"],
  "requires_version": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `required_fields` | array | Additional required identity fields beyond base schema |
| `allowed_contexts` | array | Permitted deployment contexts (empty = all allowed) |
| `requires_version` | boolean | Whether `agent_version` field is mandatory |

**Example:** Enforce production-only deployment with version tracking:
```json
"identity": {
  "required_fields": ["agent_version", "deployment_context", "operator_id"],
  "allowed_contexts": ["production"],
  "requires_version": true
}
```

### 2. Tool Layer Rules

Control tool capabilities and permissions:

```json
"tool_layer": {
  "max_severity": "medium",
  "requires_tool_inventory": true,
  "blocked_permissions": [
    "filesystem:write unrestricted",
    "network:external unrestricted"
  ],
  "blocked_sources": ["unverified-external", "unknown"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `max_severity` | string | Maximum allowed risk severity (`low`/`medium`/`high`/`critical`) |
| `requires_tool_inventory` | boolean | Whether tool_layer must be present and non-empty |
| `blocked_permissions` | array | Permission patterns that are not allowed |
| `blocked_sources` | array | Tool source types that are prohibited |

**Permission blocking patterns:**
- `"filesystem:write unrestricted"` - Blocks unrestricted filesystem write
- `"network:external unrestricted"` - Blocks unrestricted external network access
- `"system:execute arbitrary"` - Blocks arbitrary code execution

**Example:** Strict security profile for high-value systems:
```json
"tool_layer": {
  "max_severity": "low",
  "requires_tool_inventory": true,
  "blocked_permissions": [
    "filesystem:write",
    "network:external",
    "system:execute"
  ],
  "blocked_sources": ["unverified-external", "unknown", "community"]
}
```

### 3. Risk Layer Rules

Control risk assessment requirements:

```json
"risk_layer": {
  "requires_risk_assessment": true,
  "max_unmitigated_critical": 0,
  "max_unmitigated_high": 2,
  "requires_mitigation_for": ["critical", "high"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requires_risk_assessment` | boolean | Whether risk_layer must be present |
| `max_unmitigated_critical` | integer | Maximum number of unmitigated critical risks (0 = none allowed) |
| `max_unmitigated_high` | integer | Maximum number of unmitigated high risks |
| `requires_mitigation_for` | array | Severity levels requiring mitigation status |

**Example:** Aggressive risk posture for regulated environments:
```json
"risk_layer": {
  "requires_risk_assessment": true,
  "max_unmitigated_critical": 0,
  "max_unmitigated_high": 0,
  "max_unmitigated_medium": 1,
  "requires_mitigation_for": ["critical", "high", "medium"]
}
```

### 4. Attestation Rules

Control attestation and signature requirements:

```json
"attestation": {
  "requires_signature": true,
  "requires_timestamp": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requires_signature` | boolean | Whether attestations must be cryptographically signed |
| `requires_timestamp` | boolean | Whether attestations must include timestamp |

**Example:** Full attestation chain for audit trails:
```json
"attestation": {
  "requires_signature": true,
  "requires_timestamp": true,
  "requires_operator_id": true,
  "requires_audit_trail": true
}
```

## Creating a Custom Profile

### Step 1: Define Requirements

Identify the compliance framework or policy you want to enforce:

- **Regulatory standards**: SOC2, ISO27001, EIDAS, HIPAA, GDPR
- **Organizational policies**: Security baselines, risk tolerances
- **Environment-specific rules**: Production vs. development policies

### Step 2: Create Profile JSON

Create a new file in the `profiles/` directory with a descriptive name:

```bash
# profiles/my-org-production.json
{
  "profile_version": "0.1",
  "profile_id": "my-org-production",
  "framework": {
    "name": "MyOrg Production Security Policy",
    "version": "1.0",
    "description": "Production deployment requirements for MyOrg agents"
  },
  "rules": {
    "identity": {
      "required_fields": ["agent_version", "deployment_context", "approval_id"],
      "allowed_contexts": ["production"],
      "requires_version": true
    },
    "tool_layer": {
      "max_severity": "medium",
      "requires_tool_inventory": true,
      "blocked_permissions": [
        "filesystem:write unrestricted",
        "network:external unrestricted",
        "system:execute arbitrary"
      ],
      "blocked_sources": ["unverified-external", "unknown"]
    },
    "risk_layer": {
      "requires_risk_assessment": true,
      "max_unmitigated_critical": 0,
      "max_unmitigated_high": 1,
      "requires_mitigation_for": ["critical", "high"]
    },
    "attestation": {
      "requires_signature": true,
      "requires_timestamp": true
    }
  },
  "metadata": {
    "author": "MyOrg Security Team",
    "created_at": "2026-07-07T00:00:00Z",
    "updated_at": "2026-07-07T00:00:00Z",
    "documentation_url": "https://internal.myorg.com/security/agent-policy"
  }
}
```

### Step 3: Validate Against Schema

Ensure your profile conforms to the schema:

```bash
# Validate the profile JSON structure
trust-cli validate profiles/my-org-production.json --schema compliance-profile
```

### Step 4: Create Test Fixtures

Create test fixtures to validate profile behavior:

```bash
# cli/src/compliance-fixtures/my-org-production-known-good.json
# cli/src/compliance-fixtures/my-org-production-known-bad.json
```

**Known-good fixture**: AgentBOM that should pass all rules
**Known-bad fixture**: AgentBOM that should fail specific rules

### Step 5: Test Profile

Test your profile against fixtures:

```bash
# Test against known-good (should pass)
trust-cli compliance-check cli/src/compliance-fixtures/my-org-production-known-good.json \
  --profile profiles/my-org-production.json

# Test against known-bad (should fail with specific errors)
trust-cli compliance-check cli/src/compliance-fixtures/my-org-production-known-bad.json \
  --profile profiles/my-org-production.json
```

## Profile Distribution

### Internal Distribution

For organizational profiles:

1. **Version control**: Store profiles in a internal git repository
2. **Access control**: Restrict profile modifications to security team
3. **Change management**: Require approval for profile updates
4. **Distribution**: Bundle profiles with internal tooling or via secure CDN

### Public Distribution

For community or regulatory profiles:

1. **Submit PR**: Contribute to `agent-trust-infra/profiles/`
2. **Documentation**: Include framework documentation links
3. **Test coverage**: Provide comprehensive test fixtures
4. **Semantic versioning**: Update `profile_version` for breaking changes

### Profile Naming Convention

Use lowercase with hyphens for multi-word identifiers:

- `soc2-2024.json`
- `iso27001-2022.json`
- `eidas-controlled.json`
- `my-org-production.json`
- `nist-800-53-rev5.json`

## Pre-Built Profiles

### SOC2 2024

`profiles/soc2-2024.json`

Designed for SOC 2 Type II compliance with focus on security, availability, and confidentiality. Blocks unrestricted filesystem and network access, requires comprehensive risk mitigation.

### ISO27001 2022

`profiles/iso27001-2022.json`

Aligned with ISO/IEC 27001:2022 information security management. Requires tool inventory, risk assessment, and mitigation for critical/high severity risks.

### EIDAS Controlled

`profiles/eidas-controlled.json`

For EIDAS-level controlled digital identity services. Strict tool controls and comprehensive attestation requirements.

## Best Practices

### 1. Start Conservative

Begin with restrictive rules and relax based on operational needs:

```json
"tool_layer": {
  "max_severity": "low",  // Start strict
  "blocked_permissions": [
    "filesystem:write",
    "network:external"
  ]
}
```

### 2. Use Environment-Specific Profiles

Create separate profiles for different deployment contexts:

- `my-org-development.json` - Permissive for development
- `my-org-staging.json` - Moderate restrictions
- `my-org-production.json` - Strict security controls

### 3. Document Rationale

Include framework documentation URLs in metadata:

```json
"metadata": {
  "documentation_url": "https://www.aicpa.org/soc4so",
  "rationale": "SOC2 criteria require access controls and monitoring"
}
```

### 4. Version Profile Changes

Update `profile_id` or add `profile_version` for breaking changes:

- `my-org-v1.json` → `my-org-v2.json` (breaking changes)
- Or use semantic versioning in `profile_id`: `my-org-1.0`, `my-org-2.0`

### 5. Test Drift

Regularly test existing agents against updated profiles:

```bash
# Test all agent BOMs against updated profile
for bom in agents/*/agentbom.json; do
  trust-cli compliance-check "$bom" --profile profiles/my-org-production.json
done
```

## Troubleshooting

### Profile Validation Errors

**Error**: `Missing required field: "profile_version"`
**Fix**: Ensure `"profile_version": "0.1"` is present

**Error**: `Invalid enum value for max_severity`
**Fix**: Use one of: `"low"`, `"medium"`, `"high"`, `"critical"`

### Compliance Check Failures

**Error**: `Tool permission blocked: filesystem:write unrestricted`
**Context**: Agent declares a blocked permission pattern
**Action**: Remove permission from agent or adjust profile `blocked_permissions`

**Error**: `Too many unmitigated high risks: 3 (max: 2)`
**Context**: Risk layer exceeds threshold
**Action**: Add mitigations to agent risk assessment or relax `max_unmitigated_high`

**Error**: `Missing required field: agent_version`
**Context**: Agent identity missing required field
**Action**: Add field to AgentBOM identity section

## Integration with CI/CD

### Pre-Deployment Validation

Add compliance checks to deployment pipelines:

```yaml
# .github/workflows/deploy.yml
- name: Validate compliance
  run: |
    trust-cli compliance-check agentbom.json \
      --profile profiles/${COMPLIANCE_PROFILE}.json \
      --exit-on-failure
```

### Policy-as-Code

Treat compliance profiles as code:

1. **Version control**: Store profiles in git
2. **Review process**: Require PR approval for profile changes
3. **Automated testing**: Run profiles against test suite
4. **Documentation**: Maintain policy rationale in commit messages

## Advanced Topics

### Custom Rule Extensions

For organization-specific validation beyond standard rules:

1. Extend the `ComplianceProfile` schema
2. Add custom validation logic in `trust-cli`
3. Maintain backward compatibility with standard profiles

### Profile Composition

Combine multiple profiles for layered compliance:

```bash
# Check against multiple profiles
trust-cli compliance-check agentbom.json \
  --profile profiles/soc2-2024.json \
  --profile profiles/internal-security.json \
  --profile profiles/regional-gdpr.json
```

### Continuous Compliance Monitoring

Schedule periodic compliance checks:

```bash
# Daily compliance scan
cron job: 0 2 * * * trust-cli compliance-check inventory/ \
  --profile profiles/production.json --report
```

## References

- **Schema**: `specs/compliance-profile/schema.json`
- **Examples**: `profiles/*.json`
- **Test fixtures**: `cli/src/compliance-fixtures/*.json`
- **Milestone 3**: `docs/15-milestones.md` (Audit Evidence & Compliance Features)
- **Schema repository**: [github.com/WasmAgent/agent-trust-infra](https://github.com/WasmAgent/agent-trust-infra)

## Support

For questions or issues with compliance profile authoring:

1. **Documentation**: Check this guide and schema comments
2. **Examples**: Review pre-built profiles in `profiles/`
3. **Issues**: File at [github.com/WasmAgent/agent-trust-infra/issues](https://github.com/WasmAgent/agent-trust-infra/issues)
4. **Community**: Join discussions in [WasmAgent GitHub Discussions](https://github.com/WasmAgent/agent-trust-infra/discussions)
