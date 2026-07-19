# SLO Guidance for Production Deployments

> **Status:** Research preview guidance — targets are advisory, not contractual SLAs.
> **Last updated:** 2026-07-20
> **Tracking:** WasmAgent/agent-trust-infra#233 (Milestone 8)

## 1. Purpose and scope

This document defines **Service Level Objectives (SLOs)** and production deployment
guidance for the Agent Trust Infrastructure validation pipeline and CLI tooling. It is
intended for platform engineers and DevOps teams deploying `@wasmagent/agentbom-core`,
`@wasmagent/mcp-posture-core`, or the `trust-cli` binary in production environments
where trust-artifact validation is on the critical path.

**In scope:**

| Component | What this guidance covers |
|---|---|
| `validateAgentBOM()` | Schema validation latency, error-report fidelity |
| `validateMCPPosture()` | Schema validation latency, error-report fidelity |
| `BOMProcessingPipeline` | Streaming throughput, memory bounds, backpressure behavior |
| `trust-cli` commands | CLI startup time, `agentbom pipeline` throughput |
| `trust-cli generate` | AgentBOM generation from live agent directories |

**Out of scope (frozen or moved downstream):**

> `trust-passport-core` and `trust-runtime` are **frozen** — all Trust Passport
> performance work lives in `WasmAgent/open-agent-audit` (`@openagentaudit/passport`).
> Runtime MCP filtering, AEP signing, and evidence-quality audit belong in
> `wasmagent-js` packages. This guidance scopes SLOs to the specification-layer
> validators and CLI shipped in this repository only.

## 2. Service Level Indicators (SLIs)

SLIs are the **measurable quantities** that determine whether a service is performing
acceptably. The following SLIs are defined for the trust infrastructure components.

### 2.1 Validation latency

Time from invocation of a `validate*()` function to the return of the
`ValidationResult` object, measured via `performance.now()`.

| SLI ID | Indicator | Unit | Collection point |
|---|---|---|---|
| VL-01 | Single-AgentBOM validation latency | milliseconds | `validateAgentBOM(data)` |
| VL-02 | Single-MCP-Posture validation latency | milliseconds | `validateMCPPosture(data)` |
| VL-03 | Pipeline per-artifact latency | milliseconds | `BOMProcessingPipeline.process()` — per-artifact `durationMs` |

### 2.2 Pipeline throughput

Number of AgentBOM artifacts fully validated per unit of wall-clock time.

| SLI ID | Indicator | Unit | Collection point |
|---|---|---|---|
| PT-01 | Pipeline artifacts/second | artifacts/s | `PipelineMetrics.totalProcessed / PipelineMetrics.durationMs * 1000` |
| PT-02 | Pipeline bytes/second | MB/s | `PipelineMetrics.totalBytesProcessed / PipelineMetrics.durationMs * 1000` |

### 2.3 Resource efficiency

Peak memory consumption during pipeline execution.

| SLI ID | Indicator | Unit | Collection point |
|---|---|---|---|
| RE-01 | Peak heap during pipeline run | bytes | `PipelineMetrics.peakMemoryBytes` |
| RE-02 | Per-artifact memory overhead | bytes | `process.memoryUsage().heapUsed` delta per artifact |

### 2.4 CLI responsiveness

End-to-end wall-clock time for interactive CLI commands.

| SLI ID | Indicator | Unit | Collection point |
|---|---|---|---|
| CR-01 | `trust-cli validate` exit latency | milliseconds | CLI wall-clock (external) |
| CR-02 | `trust-cli agentbom pipeline` startup | milliseconds | Time to first artifact output |
| CR-03 | `trust-cli generate bom` exit latency | milliseconds | CLI wall-clock (external) |

## 3. Service Level Objectives (SLOs)

SLOs are **quantitative targets** attached to the SLIs above. These are advisory targets
for the current research-preview release. As the system graduates to production (Phase 6),
these will be tightened and formalized into contractual SLAs.

### 3.1 Validation latency SLOs

| SLO | Target | Measurement method |
|---|---|---|
| **SLO-VL-01** | p99 single-AgentBOM validation ≤ 50 ms | Warm-jvm: compile schema once, validate 1,000 representative BOMs, report p99 |
| **SLO-VL-02** | p99 single-MCP-Posture validation ≤ 50 ms | Same methodology as VL-01 against `validateMCPPosture` |
| **SLO-VL-03** | p99 per-artifact pipeline latency ≤ 100 ms | Pipeline run with backpressure disabled, 1,000 artifacts, report per-artifact p99 |

> **Note:** Cold-start latency (first validation call before schema compilation cache is
> populated) is excluded from SLO targets. The Ajv `compile()` call happens once per
> process lifetime via the lazy `getValidator()` singleton.

### 3.2 Pipeline throughput SLOs

| SLO | Target | Conditions |
|---|---|---|
| **SLO-PT-01** | ≥ 500 artifacts/second (single partition) | BOMs ≤ 10 KB each, `maxConcurrency: 4`, no backpressure |
| **SLO-PT-02** | ≥ 50 MB/second wall-clock throughput | NDJSON input, BOMs averaging 10 KB, single partition |
| **SLO-PT-03** | Linear scaling with partition count (N partitions → ~N × throughput) | `partitionCount: 2, 4, 8` — within 20% of ideal scaling factor |

### 3.3 Resource efficiency SLOs

| SLO | Target | Conditions |
|---|---|---|
| **SLO-RE-01** | Peak heap ≤ 512 MB for 10,000-artifact pipeline run | Default `maxMemoryBytes: 512 MB`; backpressure must prevent OOM |
| **SLO-RE-02** | Per-artifact overhead ≤ 2× artifact size | Heap growth per artifact must not exceed 2× the artifact's JSON byte size |

### 3.4 CLI responsiveness SLOs

| SLO | Target | Conditions |
|---|---|---|
| **SLO-CR-01** | `trust-cli validate <file>` ≤ 200 ms exit time | Single BOM file ≤ 100 KB, warm cache |
| **SLO-CR-02** | Pipeline first-artifact output ≤ 500 ms | Any input format, default configuration |
| **SLO-CR-03** | `trust-cli generate bom --agent <dir>` ≤ 2 s | Agent directory with ≤ 20 tool definitions |

## 4. Measurement methodology

### 4.1 Collecting SLI data via the CLI

The `agentbom pipeline` command already exposes timing and memory metrics:

```bash
# Validate a directory of BOMs — metrics printed to stdout
trust-cli agentbom pipeline ./boms/ --partitions 4

# Output includes per-artifact timing and pipeline summary:
#   Duration: 847ms (wall: 892ms)
#   Peak heap: 42,194,304 bytes
#   Processed: 500 | Errors: 3 | Throughput: 560 artifacts/s
```

For single-validation latency benchmarks:

```bash
# Time a single validation call (external measurement)
time trust-cli validate ./fixtures/valid-agentbom.json

# Validate against a specific schema
trust-cli validate ./artifacts/bom.json --schema agentbom
```

### 4.2 Programmatic measurement

The `PipelineMetrics` interface returned by `BOMProcessingPipeline.process()` provides
structured SLI data for automated collection:

```typescript
import { runPipeline } from "@wasmagent/agentbom-core";

const { results, metrics } = await runPipeline("./boms/", {
  partitionCount: 4,
});

// SLI values available directly:
console.log({
  totalProcessed: metrics.totalProcessed,       // PT-01 numerator
  totalErrors: metrics.totalErrors,
  totalBytesProcessed: metrics.totalBytesProcessed, // PT-02 numerator
  durationMs: metrics.durationMs,              // PT-01, PT-02 denominator
  peakMemoryBytes: metrics.peakMemoryBytes,    // RE-01
  partitionCounts: metrics.partitionCounts,    // scaling analysis
});
```

### 4.3 Baseline measurement procedure

To establish a performance baseline for a deployment environment:

**Goal:** Capture p50, p95, and p99 latency percentiles and peak memory for the
validation pipeline under representative load.

**Steps:**

1. Prepare a corpus of ≥ 1,000 representative AgentBOM JSON files (mix of sizes:
   1 KB–100 KB). NDJSON format preferred for streaming tests.
2. Run the pipeline with default configuration (single partition, `maxConcurrency: 4`):

   ```bash
   trust-cli agentbom pipeline ./corpus/ --output baseline-results.jsonl
   ```

3. Extract per-artifact `durationMs` values from the output. Compute percentiles:

   ```bash
   # Extract durations from NDJSON output
   jq '.durationMs' baseline-results.jsonl | sort -n | awk '
     BEGIN { n=0 }
     { vals[n++] = $1 }
     END {
       print "p50:", vals[int(n*0.50)]
       print "p95:", vals[int(n*0.95)]
       print "p99:", vals[int(n*0.99)]
     }'
   ```

4. Record peak heap from the pipeline summary line.
5. Repeat with `--partitions 2`, `--partitions 4`, `--partitions 8` to validate
   scaling behavior (SLO-PT-03).
6. Store results in version-controlled `docs/performance-baselines.json` for
   regression detection.

**Definition of done:** Baseline document committed with p50/p95/p99 latency,
peak memory, and throughput numbers for the deployment environment.

## 5. Production deployment guidance

### 5.1 Deployment topology

| Deployment pattern | Recommended when | SLO impact |
|---|---|---|
| **Inline validation** (agent runtime calls `validate*()` directly) | Low-throughput (< 100 BOMs/min), single-agent deployments | VL-01, VL-02 directly applicable |
| **Pipeline service** (dedicated process running `agentbom pipeline`) | High-throughput (> 100 BOMs/min), multi-agent fleets | PT-01, PT-02, RE-01 applicable |
| **Batch validation** (CI/CD pipeline step) | Pre-deployment gates, compliance checks | CR-01, CR-02 applicable; latency less critical |

### 5.2 Resource sizing

Minimum resource recommendations for the pipeline service pattern:

| Artifact volume | CPU cores | Memory | Storage I/O | Rationale |
|---|---|---|---|---|
| ≤ 100 BOMs/min | 2 | 512 MB | Any | Default pipeline config sufficient |
| 100–1,000 BOMs/min | 4 | 1 GB | SSD preferred | Increase `maxConcurrency` to 8 |
| 1,000–10,000 BOMs/min | 8 | 2 GB | NVMe recommended | Use `--partitions 8`, increase `maxMemoryBytes` to 1 GB |
| > 10,000 BOMs/min | 16+ | 4 GB | NVMe required | Horizontal scaling via partitioned queues; consider multiple pipeline processes |

### 5.3 Configuration tuning

Key configuration knobs in `BOMProcessingPipelineConfig`:

| Parameter | Default | When to adjust | SLO impact |
|---|---|---|---|
| `maxConcurrency` | 4 | CPU-bound environments; increase on high-core-count hosts | Higher values improve PT-01 but increase RE-01 |
| `maxMemoryBytes` | 536,870,912 (512 MB) | Memory-constrained containers; lower to enforce harder bounds | Directly affects RE-01 |
| `partitionCount` | 1 | Multi-core hosts; each partition runs on its own core | Affects PT-03 scaling |
| `backpressureInitialMs` | 10 | Already tuned; increase only for extremely I/O-bound workloads | Affects PT-01 under memory pressure |

### 5.4 Backpressure and memory safety

The pipeline implements exponential backpressure to prevent OOM under heavy load:

- When `peakMemoryBytes` approaches `maxMemoryBytes`, the pipeline pauses ingestion
  via `backpressureWait()`, backing off from 10 ms to 1,000 ms exponentially.
- **This is a safety mechanism, not an SLO compliance tool.** If backpressure triggers
  frequently, the deployment is under-provisioned for the workload.
- **Alert threshold:** If backpressure wait exceeds 100 ms for more than 10 consecutive
  artifacts, the pipeline is memory-bound and needs horizontal scaling.

### 5.5 Schema cache warm-up

Ajv schema compilation happens once per process via the lazy `getValidator()` singleton.
To avoid cold-start latency in production:

```bash
# Warm-up: validate a trivial BOM at service startup
trust-cli validate ./fixtures/minimal-bom.json
```

For long-running services, this is typically a one-time cost. For serverless
deployments (Lambda, Cloud Functions), consider pinning the process or using a
schema-precompilation step at build time.

## 6. Capacity planning

### 6.1 Throughput estimation

Use this formula to estimate required pipeline capacity:

```
required_artifacts_per_second = peak_bom_submission_rate × 1.5 (safety factor)
required_memory_mb = artifact_size_kb × required_artifacts_per_second × 0.1 × 2 (overhead factor)
```

Example: 500 BOMs/min peak submission, average 10 KB per BOM:

```
required = (500/60) × 1.5 = 12.5 artifacts/s minimum
memory    = 10 × 12.5 × 0.1 × 2 = 25 MB minimum (allocate 512 MB for headroom)
```

### 6.2 Scaling strategy

| Phase | Action | Trigger |
|---|---|---|
| 1. Vertical scale | Increase `maxConcurrency` and `maxMemoryBytes` | CPU < 70%, memory < 512 MB available |
| 2. Partition scale | Increase `--partitions` to match core count | PT-03 degradation > 20% below ideal |
| 3. Horizontal scale | Run multiple pipeline processes with partitioned input queues | Single-process throughput ceiling reached |
| 4. Batching | Buffer incoming BOMs into NDJSON batches before pipeline ingestion | High-frequency small BOMs (≤ 1 KB each) |

## 7. Alerting and escalation

### 7.1 SLO burn-rate alerts

Use a burn-rate alerting model (Google SRE Handbook) rather than threshold alerts:

| Alert | Burn-rate window | Trigger | Severity |
|---|---|---|---|
| Validation latency breach | 1-hour window, 2× error budget | p99 validation > 100 ms sustained | P2 — investigate within 4 hours |
| Throughput degradation | 1-hour window, 5× error budget | Artifacts/s drops below 50% of SLO-PT-01 | P2 — investigate within 4 hours |
| Memory pressure | 10-minute window, immediate | Peak heap > 80% of `maxMemoryBytes` | P1 — investigate within 1 hour |
| Pipeline stall | No progress for 5 minutes | `totalProcessed` not increasing | P1 — investigate within 1 hour |

### 7.2 Integration with observability stacks

The pipeline's `PipelineMetrics` can be exported to Prometheus/OpenTelemetry for
continuous SLO monitoring:

```typescript
// Example: export pipeline metrics to Prometheus
import { Histogram, Gauge, Registry } from "prom-client";

const validationLatency = new Histogram({
  name: "trust_infra_validation_duration_ms",
  help: "Per-artifact validation latency in milliseconds",
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  labelNames: ["schema", "valid"],
});

const pipelineThroughput = new Gauge({
  name: "trust_infra_pipeline_throughput_artifacts_per_sec",
  help: "Current pipeline throughput in artifacts per second",
});
```

> **Note:** The Continuous Trust Monitoring service (Milestone 8) will provide
> native Prometheus/OpenTelemetry integration. Until that ships, metrics export
> must be wired at the application layer.

## 8. Regression detection

### 8.1 Performance regression baseline

Store baseline performance numbers alongside the codebase:

| Baseline | Measurement date | Environment | p50 | p95 | p99 | Peak heap |
|---|---|---|---|---|---|---|
| Initial | 2026-07-20 | Reference (4-core, 512 MB) | — | — | — | — |

> **Action:** Run the baseline measurement procedure (Section 4.3) and populate this
> table after initial deployment.

### 8.2 Regression thresholds

Flag a potential regression when a measured value degrades beyond these thresholds
from the baseline:

| Metric | Regression threshold | Action |
|---|---|---|
| p99 validation latency | > 2× baseline | Investigate schema changes, dependency updates |
| Pipeline throughput | < 0.5× baseline | Investigate memory pressure, backpressure frequency |
| Peak heap | > 2× baseline | Investigate memory leaks, new object allocations |

### 8.3 CI performance gate

For CI integration, add a performance smoke test that validates baseline latency
bounds are not exceeded:

```bash
# CI performance gate — fail if validation exceeds 100ms p99
trust-cli agentbom pipeline ./fixtures/benchmark-corpus/ \
  --partitions 1 \
  --output ci-perf-results.jsonl

# Parse and assert (integrate with your CI assertion framework)
jq -r '.durationMs' ci-perf-results.jsonl | sort -n | awk '
  { vals[NR] = $1 }
  END { p99 = vals[int(NR * 0.99)]; if (p99 > 100) { print "FAIL: p99=" p99 " > 100ms"; exit 1 } else { print "PASS: p99=" p99 "ms"; exit 0 } }
'
```

## 9. Related references

| Reference | Description |
|---|---|
| [docs/15-milestones.md](./15-milestones.md) | Milestone 8 — production readiness deliverables |
| [docs/enterprise-onboarding.md](./enterprise-onboarding.md) | Enterprise adoption runbooks and certification guide |
| [docs/architecture.md](./architecture.md) | Trust artifact chain and component responsibilities |
| [packages/agentbom-core/src/pipeline.ts](../packages/agentbom-core/src/pipeline.ts) | Pipeline implementation with `PipelineMetrics` and `BOMProcessingPipelineConfig` |
| [packages/agentbom-core/src/index.ts](../packages/agentbom-core/src/index.ts) | `validateAgentBOM()` with cached Ajv schema compilation |
| [packages/mcp-posture-core/src/index.ts](../packages/mcp-posture-core/src/index.ts) | `validateMCPPosture()` with cached Ajv schema compilation |
| [cli/src/agentbom-pipeline.ts](../cli/src/agentbom-pipeline.ts) | CLI `agentbom pipeline` command with built-in metrics output |
