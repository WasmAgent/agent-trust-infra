#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateAgentBOM } from '../../packages/agentbom-core/src/index.js';

/** AgentBOM structure for dashboard generation */
interface AgentBOM {
  agentbom_version: string;
  identity?: {
    agent_id?: string;
    agent_name?: string;
    agent_version?: string;
    deployment_context?: string;
    generated_at?: string;
  };
  model_layer?: {
    provider?: string;
    model_id?: string;
    model_version?: string;
    capabilities?: string[];
  };
  tool_layer?: Array<{
    tool_id?: string;
    tool_name?: string;
    source?: string;
    permissions?: string[];
    risk_signals?: string[];
    mcp_server_id?: string;
  }>;
  prompt_layer?: {
    system_prompt_hash?: string;
    template_ids?: string[];
  };
  permission_layer?: {
    granted_scopes?: string[];
    data_access?: string[];
    credential_references?: string[];
  };
  evidence_layer?: {
    aep_references?: string[];
    evidence_hashes?: Array<{
      type?: string;
      hash?: string;
      timestamp?: string;
    }>;
  };
  risk_layer?: Array<{
    risk_id?: string;
    severity?: string;
    category?: string;
    description?: string;
    status?: string;
  }>;
  audit_log?: Array<{
    timestamp?: string;
    event_type?: string;
    actor?: string;
    resource?: string;
    outcome?: string;
    details?: Record<string, unknown>;
  }>;
  attestation?: {
    generator?: string;
    generator_version?: string;
  };
}

/** Generate HTML dashboard from AgentBOM data */
export function generateDashboardHTML(bom: AgentBOM): string {
  const identity = bom.identity || {};
  const modelLayer = bom.model_layer || {};
  const toolLayer = bom.tool_layer || [];
  const permissionLayer = bom.permission_layer || {};
  const evidenceLayer = bom.evidence_layer || {};
  const riskLayer = bom.risk_layer || [];
  const auditLog = bom.audit_log || [];
  const attestation = bom.attestation || {};

  // Calculate statistics
  const totalTools = toolLayer.length;
  const builtInTools = toolLayer.filter((t) => t.source === 'builtin').length;
  const mcpTools = toolLayer.filter((t) => t.source === 'mcp').length;
  const pluginTools = toolLayer.filter((t) => t.source === 'plugin').length;

  const riskStats = {
    critical: riskLayer.filter((r) => r.severity === 'critical').length,
    high: riskLayer.filter((r) => r.severity === 'high').length,
    medium: riskLayer.filter((r) => r.severity === 'medium').length,
    low: riskLayer.filter((r) => r.severity === 'low').length,
    info: riskLayer.filter((r) => r.severity === 'info').length,
  };

  const openRisks = riskLayer.filter((r) => r.status === 'open').length;
  const acceptedRisks = riskLayer.filter((r) => r.status === 'accepted').length;
  const mitigatedRisks = riskLayer.filter((r) => r.status === 'mitigated').length;

  const auditEvents = auditLog.length;
  const successfulEvents = auditLog.filter((a) => a.outcome === 'success').length;
  const failedEvents = auditLog.filter((a) => a.outcome === 'failure').length;

  const severityColor = (severity: string): string => {
    const colors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#16a34a',
      info: '#2563eb',
    };
    return colors[severity as keyof typeof colors] || '#6b7280';
  };

  const statusBadge = (status: string): string => {
    const badges = {
      open: '<span class="badge badge-open">Open</span>',
      accepted: '<span class="badge badge-accepted">Accepted</span>',
      mitigated: '<span class="badge badge-mitigated">Mitigated</span>',
    };
    return (
      badges[status as keyof typeof badges] || `<span class="badge badge-unknown">${status}</span>`
    );
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Trust Dashboard - ${identity.agent_name || 'Unknown Agent'}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .header .subtitle {
      font-size: 1.1em;
      opacity: 0.9;
      margin-top: 10px;
    }

    .header .meta {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 0.9em;
      opacity: 0.8;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 40px;
      background: #f8fafc;
    }

    .stat-card {
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      text-align: center;
      transition: transform 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .stat-value {
      font-size: 2.5em;
      font-weight: 700;
      color: #1e3a8a;
      margin-bottom: 8px;
    }

    .stat-label {
      font-size: 0.9em;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .section {
      padding: 40px;
      border-bottom: 1px solid #e5e7eb;
    }

    .section:last-child {
      border-bottom: none;
    }

    .section-title {
      font-size: 1.8em;
      color: #1e293b;
      margin-bottom: 24px;
      font-weight: 600;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }

    .info-card {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
    }

    .info-card .label {
      font-size: 0.85em;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .info-card .value {
      font-size: 1.1em;
      color: #1e293b;
      font-weight: 500;
      word-break: break-word;
    }

    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .tool-card {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }

    .tool-card .tool-name {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
      font-size: 1.1em;
    }

    .tool-card .tool-id {
      font-size: 0.85em;
      color: #64748b;
      margin-bottom: 12px;
    }

    .tool-card .badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .tool-card .permissions {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }

    .tool-card .permissions-title {
      font-size: 0.85em;
      color: #64748b;
      margin-bottom: 6px;
    }

    .tool-card .permission-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge.builtin {
      background: #dbeafe;
      color: #1e40af;
    }

    .badge.mcp {
      background: #fef3c7;
      color: #92400e;
    }

    .badge.plugin {
      background: #e0e7ff;
      color: #3730a3;
    }

    .badge-risk {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      font-weight: 600;
      background: #fee2e2;
      color: #991b1b;
    }

    .permission-tag {
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      color: #475569;
    }

    .risk-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    .risk-table th,
    .risk-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    .risk-table th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .risk-table tr:hover {
      background: #f8fafc;
    }

    .risk-table .severity-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-open {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-accepted {
      background: #dcfce7;
      color: #166534;
    }

    .badge-mitigated {
      background: #dbeafe;
      color: #1e40af;
    }

    .audit-log {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .audit-entry {
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .audit-entry:last-child {
      border-bottom: none;
    }

    .audit-entry .timestamp {
      font-size: 0.85em;
      color: #64748b;
      margin-bottom: 8px;
    }

    .audit-entry .event-type {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
    }

    .audit-entry .details {
      font-size: 0.9em;
      color: #475569;
      margin-top: 8px;
    }

    .audit-entry .outcome {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      font-weight: 600;
      margin-left: 8px;
    }

    .audit-entry .outcome.success {
      background: #dcfce7;
      color: #166534;
    }

    .audit-entry .outcome.failure {
      background: #fee2e2;
      color: #991b1b;
    }

    .evidence-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .evidence-item {
      background: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }

    .evidence-item .type {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
    }

    .evidence-item .hash {
      font-family: monospace;
      font-size: 0.85em;
      color: #64748b;
      word-break: break-all;
    }

    .evidence-item .timestamp {
      font-size: 0.75em;
      color: #94a3b8;
      margin-top: 8px;
    }

    .footer {
      background: #1e293b;
      color: #94a3b8;
      padding: 20px;
      text-align: center;
      font-size: 0.9em;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }

    .capabilities-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .capability-tag {
      background: #e0f2fe;
      color: #0369a1;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 500;
    }

    @media (max-width: 768px) {
      .header h1 {
        font-size: 1.8em;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .tools-grid {
        grid-template-columns: 1fr;
      }

      .info-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 Agent Trust Dashboard</h1>
      <div class="subtitle">${identity.agent_name || 'Unknown Agent'}</div>
      <div class="meta">
        Agent ID: ${identity.agent_id || 'N/A'} |
        Version: ${identity.agent_version || 'N/A'} |
        Generated: ${identity.generated_at ? new Date(identity.generated_at).toLocaleDateString() : 'N/A'}
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalTools}</div>
        <div class="stat-label">Total Tools</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${openRisks}</div>
        <div class="stat-label">Open Risks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${auditEvents}</div>
        <div class="stat-label">Audit Events</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${evidenceLayer.evidence_hashes?.length || 0}</div>
        <div class="stat-label">Evidence Items</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${successfulEvents}</div>
        <div class="stat-label">Successful Operations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${failedEvents}</div>
        <div class="stat-label">Failed Operations</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">🤖 Model Information</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="label">Provider</div>
          <div class="value">${modelLayer.provider || 'N/A'}</div>
        </div>
        <div class="info-card">
          <div class="label">Model ID</div>
          <div class="value">${modelLayer.model_id || 'N/A'}</div>
        </div>
        <div class="info-card">
          <div class="label">Model Version</div>
          <div class="value">${modelLayer.model_version || 'N/A'}</div>
        </div>
        <div class="info-card">
          <div class="label">Capabilities</div>
          <div class="value">
            <div class="capabilities-list">
              ${(modelLayer.capabilities || [])
                .map((cap) => `<span class="capability-tag">${cap}</span>`)
                .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">🛠️ Tool Layer (${totalTools} tools)</h2>
      <div class="tools-grid">
        ${toolLayer
          .map(
            (tool) => `
          <div class="tool-card">
            <div class="tool-name">${tool.tool_name || 'Unnamed Tool'}</div>
            <div class="tool-id">${tool.tool_id || 'No ID'}</div>
            <div class="badges">
              <span class="badge ${tool.source || 'builtin'}">${tool.source || 'builtin'}</span>
              ${(tool.risk_signals || [])
                .map((signal) => `<span class="badge-risk">⚠️ ${signal}</span>`)
                .join('')}
            </div>
            <div class="permissions">
              <div class="permissions-title">Permissions:</div>
              <div class="permission-tags">
                ${(tool.permissions || [])
                  .map((perm) => `<span class="permission-tag">${perm}</span>`)
                  .join('')}
              </div>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
      ${toolLayer.length === 0 ? '<div class="empty-state">No tools configured</div>' : ''}
    </div>

    <div class="section">
      <h2 class="section-title">⚠️ Risk Assessment</h2>
      <div class="info-grid" style="margin-bottom: 20px;">
        <div class="info-card" style="border-left-color: #dc2626;">
          <div class="label">Critical</div>
          <div class="value">${riskStats.critical}</div>
        </div>
        <div class="info-card" style="border-left-color: #ea580c;">
          <div class="label">High</div>
          <div class="value">${riskStats.high}</div>
        </div>
        <div class="info-card" style="border-left-color: #ca8a04;">
          <div class="label">Medium</div>
          <div class="value">${riskStats.medium}</div>
        </div>
        <div class="info-card" style="border-left-color: #16a34a;">
          <div class="label">Low</div>
          <div class="value">${riskStats.low}</div>
        </div>
      </div>
      ${
        riskLayer.length > 0
          ? `
        <table class="risk-table">
          <thead>
            <tr>
              <th>Risk ID</th>
              <th>Severity</th>
              <th>Category</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${riskLayer
              .map(
                (risk) => `
              <tr>
                <td>${risk.risk_id || 'N/A'}</td>
                <td>
                  <span class="severity-indicator" style="background: ${severityColor(risk.severity || 'info')}"></span>
                  ${risk.severity || 'N/A'}
                </td>
                <td>${risk.category || 'N/A'}</td>
                <td>${risk.description || 'No description'}</td>
                <td>${statusBadge(risk.status || 'unknown')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
          : '<div class="empty-state">No risks identified</div>'
      }
    </div>

    <div class="section">
      <h2 class="section-title">🔐 Permissions & Access</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="label">Granted Scopes</div>
          <div class="value">
            <div class="permission-tags" style="margin-top: 8px;">
              ${(permissionLayer.granted_scopes || [])
                .map((scope) => `<span class="permission-tag">${scope}</span>`)
                .join('')}
            </div>
          </div>
        </div>
        <div class="info-card">
          <div class="label">Data Access</div>
          <div class="value">
            <div class="permission-tags" style="margin-top: 8px;">
              ${(permissionLayer.data_access || [])
                .map((access) => `<span class="permission-tag">${access}</span>`)
                .join('')}
            </div>
          </div>
        </div>
        <div class="info-card">
          <div class="label">Credential References</div>
          <div class="value">
            <div class="permission-tags" style="margin-top: 8px;">
              ${(permissionLayer.credential_references || [])
                .map((cred) => `<span class="permission-tag">${cred}</span>`)
                .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">🔍 Evidence & Attestation</h2>
      <div class="evidence-list">
        ${(evidenceLayer.evidence_hashes || [])
          .map(
            (evidence) => `
          <div class="evidence-item">
            <div class="type">${evidence.type || 'Unknown'}</div>
            <div class="hash">${evidence.hash || 'No hash'}</div>
            <div class="timestamp">${evidence.timestamp ? new Date(evidence.timestamp).toLocaleString() : 'No timestamp'}</div>
          </div>
        `,
          )
          .join('')}
      </div>
      ${!evidenceLayer.evidence_hashes || evidenceLayer.evidence_hashes.length === 0 ? '<div class="empty-state">No evidence hashes found</div>' : ''}

      ${
        evidenceLayer.aep_references && evidenceLayer.aep_references.length > 0
          ? `
        <div style="margin-top: 24px;">
          <h3 style="font-size: 1.2em; color: #475569; margin-bottom: 16px;">AEP References</h3>
          <div class="permission-tags">
            ${evidenceLayer.aep_references
              .map((ref) => `<span class="permission-tag">${ref}</span>`)
              .join('')}
          </div>
        </div>
      `
          : ''
      }
    </div>

    ${
      auditLog.length > 0
        ? `
    <div class="section">
      <h2 class="section-title">📋 Audit Log</h2>
      <div class="audit-log">
        ${auditLog
          .map(
            (entry) => `
          <div class="audit-entry">
            <div class="timestamp">${entry.timestamp || 'No timestamp'}</div>
            <div class="event-type">
              ${entry.event_type || 'Unknown Event'}
              <span class="outcome ${entry.outcome || ''}">${entry.outcome || 'unknown'}</span>
            </div>
            <div class="details">
              Actor: ${entry.actor || 'Unknown'} | Resource: ${entry.resource || 'N/A'}
              ${entry.details ? `<br>Details: <code>${JSON.stringify(entry.details)}</code>` : ''}
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
    `
        : ''
    }

    <div class="footer">
      <div>Generated by ${attestation.generator || 'Unknown'} v${attestation.generator_version || 'N/A'}</div>
      <div style="margin-top: 8px;">Report generated: ${new Date().toISOString()}</div>
    </div>
  </div>
</body>
</html>`;
}

/** Command handler for export-dashboard */
export function exportDashboardCommand(args: string[]): number {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(
      [
        'Usage: agent-trust export-dashboard <bom.json> --output <dir>',
        '',
        'Generates a static HTML dashboard from an AgentBOM file.',
        '',
        'Arguments:',
        '  <bom.json>  Path to the AgentBOM JSON file',
        '  --output <dir>  Directory to write the HTML dashboard (required)',
        '',
        'The dashboard includes:',
        '  - Agent identity and model information',
        '  - Tool inventory with permissions and risk signals',
        '  - Risk assessment with severity breakdown',
        '  - Permissions and access overview',
        '  - Evidence and attestation data',
        '  - Audit log entries (if available)',
      ].join('\n'),
    );
    return 0;
  }

  let bomPath = '';
  let outputDir = '';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      bomPath = args[i];
    }
  }

  if (!bomPath) {
    console.error('Error: Missing required argument <bom.json>');
    return 1;
  }

  if (!outputDir) {
    console.error('Error: Missing required argument --output <dir>');
    return 1;
  }

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

    // Generate HTML
    const html = generateDashboardHTML(data);

    // Create output directory if it doesn't exist
    const outputPath = resolve(outputDir);
    try {
      mkdirSync(dirname(outputPath), { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Write HTML file
    const outputFile = resolve(outputPath, 'dashboard.html');
    writeFileSync(outputFile, html, 'utf-8');

    console.log(`✅ Dashboard generated successfully: ${outputFile}`);
    return 0;
  } catch (err) {
    console.error(
      `Error: Failed to generate dashboard: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
