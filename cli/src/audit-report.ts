#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateAgentBOM } from '../../packages/agentbom-core/src/index.js';

/** Audit log entry structure */
interface AuditLogEntry {
  timestamp: string;
  event_type: string;
  actor: string;
  resource?: string;
  outcome?: 'success' | 'failure' | 'partial';
  details?: Record<string, unknown>;
}

/** Evidence hash entry structure */
interface EvidenceHash {
  type: string;
  hash: string;
  timestamp?: string;
}

/** Evidence layer structure */
interface EvidenceLayer {
  aep_references?: string[];
  evidence_hashes?: EvidenceHash[];
}

/** AgentBOM structure (partial) */
interface AgentBOM {
  agentbom_version: string;
  identity?: {
    agent_id?: string;
    agent_name?: string;
    generated_at?: string;
  };
  audit_log?: AuditLogEntry[];
  evidence_layer?: EvidenceLayer;
  risk_layer?: Array<{
    risk_id: string;
    severity: string;
    category: string;
    description: string;
    status: string;
  }>;
}

export function generateAuditReport(bom: AgentBOM): string {
  const lines: string[] = [];

  // Header
  lines.push('════════════════════════════════════════════════════════════════════════════════');
  lines.push('                              AGENT TRUST AUDIT REPORT');
  lines.push('════════════════════════════════════════════════════════════════════════════════');

  // Agent Identity
  const identity = bom.identity;
  if (identity) {
    lines.push('');
    lines.push('Agent Identity:');
    lines.push(`  Agent ID:     ${identity.agent_id ?? 'unknown'}`);
    lines.push(`  Agent Name:   ${identity.agent_name ?? 'unknown'}`);
    lines.push(`  Generated At: ${identity.generated_at ?? 'unknown'}`);
  }

  // Audit Summary Statistics
  const auditLogs = bom.audit_log ?? [];
  const evidenceLayer = bom.evidence_layer;
  const riskLayer = bom.risk_layer ?? [];

  lines.push('');
  lines.push(
    '────────────────────────────────────────────────────────────────────────────────────',
  );
  lines.push('                              AUDIT SUMMARY');
  lines.push(
    '────────────────────────────────────────────────────────────────────────────────────',
  );

  // Event statistics by outcome
  const outcomeStats = {
    success: 0,
    failure: 0,
    partial: 0,
    unknown: 0,
  };

  for (const log of auditLogs) {
    const outcome = log.outcome;
    if (outcome === 'success') outcomeStats.success++;
    else if (outcome === 'failure') outcomeStats.failure++;
    else if (outcome === 'partial') outcomeStats.partial++;
    else outcomeStats.unknown++;
  }

  lines.push(`  Total Audit Events:       ${auditLogs.length}`);
  lines.push(`  Successful Events:        ${outcomeStats.success}`);
  lines.push(`  Failed Events:            ${outcomeStats.failure}`);
  lines.push(`  Partial Success Events:   ${outcomeStats.partial}`);
  lines.push(`  Evidence Hashes:          ${evidenceLayer?.evidence_hashes?.length ?? 0}`);
  lines.push(`  AEP References:           ${evidenceLayer?.aep_references?.length ?? 0}`);
  lines.push(`  Open Risk Findings:       ${riskLayer.filter((r) => r.status === 'open').length}`);

  // Risk Summary
  if (riskLayer.length > 0) {
    lines.push('');
    lines.push('Risk Summary:');
    const riskBySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const risk of riskLayer) {
      const severity = risk.severity.toLowerCase() as keyof typeof riskBySeverity;
      if (severity in riskBySeverity) {
        riskBySeverity[severity]++;
      }
    }

    lines.push(`  Critical: ${riskBySeverity.critical}`);
    lines.push(`  High:     ${riskBySeverity.high}`);
    lines.push(`  Medium:   ${riskBySeverity.medium}`);
    lines.push(`  Low:      ${riskBySeverity.low}`);
    lines.push(`  Info:     ${riskBySeverity.info}`);
  }

  // Evidence Citations
  if (evidenceLayer) {
    lines.push('');
    lines.push(
      '────────────────────────────────────────────────────────────────────────────────────',
    );
    lines.push('                              EVIDENCE CITATIONS');
    lines.push(
      '────────────────────────────────────────────────────────────────────────────────────',
    );

    if (evidenceLayer.evidence_hashes && evidenceLayer.evidence_hashes.length > 0) {
      lines.push('');
      lines.push('Evidence Hashes:');
      for (const evidence of evidenceLayer.evidence_hashes) {
        const timestamp = evidence.timestamp ?? 'unknown';
        lines.push(`  [${timestamp}] ${evidence.type}: ${evidence.hash}`);
      }
    }

    if (evidenceLayer.aep_references && evidenceLayer.aep_references.length > 0) {
      lines.push('');
      lines.push('AEP Event References:');
      for (const ref of evidenceLayer.aep_references) {
        lines.push(`  → ${ref}`);
      }
    }

    if (
      (!evidenceLayer.evidence_hashes || evidenceLayer.evidence_hashes.length === 0) &&
      (!evidenceLayer.aep_references || evidenceLayer.aep_references.length === 0)
    ) {
      lines.push('');
      lines.push('  No evidence citations found.');
    }
  }

  // Audit Log Entries
  if (auditLogs.length > 0) {
    lines.push('');
    lines.push(
      '────────────────────────────────────────────────────────────────────────────────────',
    );
    lines.push('                              AUDIT TRAIL');
    lines.push(
      '────────────────────────────────────────────────────────────────────────────────────',
    );

    // Group by event type for better readability
    const logsByEventType = new Map<string, AuditLogEntry[]>();
    for (const log of auditLogs) {
      const eventType = log.event_type ?? 'unknown';
      if (!logsByEventType.has(eventType)) {
        logsByEventType.set(eventType, []);
      }
      logsByEventType.get(eventType)?.push(log);
    }

    // Display events sorted by timestamp (most recent first)
    const sortedEventTypes = Array.from(logsByEventType.keys()).sort();

    for (const eventType of sortedEventTypes) {
      const events = logsByEventType.get(eventType) ?? [];

      lines.push('');
      lines.push(`${eventType} (${events.length} events):`);

      // Sort events by timestamp
      const sortedEvents = events.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      for (const event of sortedEvents) {
        const timestamp = event.timestamp;
        const actor = event.actor;
        const resource = event.resource ?? 'N/A';
        const outcome = event.outcome ?? 'unknown';
        const outcomeSymbol = outcome === 'success' ? '✓' : outcome === 'failure' ? '✗' : '○';

        lines.push(`  ${outcomeSymbol} [${timestamp}]`);
        lines.push(`      Actor: ${actor}`);
        lines.push(`      Resource: ${resource}`);
        lines.push(`      Outcome: ${outcome}`);

        if (event.details && Object.keys(event.details).length > 0) {
          lines.push(`      Details: ${JSON.stringify(event.details)}`);
        }
      }
    }
  } else {
    lines.push('');
    lines.push(
      '────────────────────────────────────────────────────────────────────────────────────',
    );
    lines.push('                              AUDIT TRAIL');
    lines.push(
      '────────────────────────────────────────────────────────────────────────────────────',
    );
    lines.push('');
    lines.push('  No audit log entries found.');
  }

  // Footer
  lines.push('');
  lines.push('════════════════════════════════════════════════════════════════════════════════');
  lines.push(`Report Generated: ${new Date().toISOString()}`);
  lines.push('════════════════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

export function auditReportCommand(args: string[]): number {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(
      [
        'Usage: agent-trust audit-report <bom.json>',
        '',
        'Generates a human-readable audit summary with evidence citations from an AgentBOM file.',
        '',
        'Arguments:',
        '  <bom.json>  Path to the AgentBOM JSON file',
        '',
        'Output includes:',
        '  - Agent identity information',
        '  - Audit summary statistics',
        '  - Risk summary by severity',
        '  - Evidence citations (hashes and AEP references)',
        '  - Detailed audit trail grouped by event type',
      ].join('\n'),
    );
    return 0;
  }

  const bomPath = args[0];
  try {
    const content = readFileSync(resolve(bomPath), 'utf-8');
    const data = JSON.parse(content) as AgentBOM;

    // Validate the AgentBOM
    const validation = validateAgentBOM(data);
    if (!validation.valid) {
      console.error('Error: Invalid AgentBOM file:');
      for (const error of validation.errors) {
        console.error(`  ${error}`);
      }
      return 1;
    }

    // Generate and print the audit report
    const report = generateAuditReport(data);
    console.log(report);
    return 0;
  } catch (err) {
    console.error(
      `Error: Failed to read or parse AgentBOM file: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
