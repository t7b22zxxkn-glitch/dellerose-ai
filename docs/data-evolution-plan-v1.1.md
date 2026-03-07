## DelleRose.ai v1.1 data evolution plan

This staged plan keeps backward compatibility while preparing enterprise-scale
operations.

### Stage 1 (implemented now)

- `publish_jobs` table with idempotency and retry metadata
- `publish_job_status` enum:
  - `queued`
  - `processing`
  - `retrying`
  - `failed`
  - `published`
- RLS policies for user isolation (`select`, `insert`, `update`)
- Indexes for queue scans and workflow/platform lookups

### Stage 2 (next)

- `workflow_runs`
  - one row per end-to-end workflow execution
  - links brainstorm, generation, approval and publish phases
  - includes correlation ID and aggregate latency fields

- `draft_versions`
  - immutable version history per workflow/platform draft
  - stores regenerate/edit lineage and approval actor/timestamp

### Stage 3 (next)

- `event_logs`
  - append-only structured events for actions and failures
  - references `request_id`, `workflow_id`, `user_id`, `action_name`

- `usage_metrics`
  - token and cost telemetry by workflow/platform/model/date
  - aggregation-friendly schema for analytics dashboards

### Migration guardrails

- Additive migrations only (no destructive rename/drop without compatibility layer)
- Backfill scripts for nullable-to-required transitions
- RLS required on every new table before feature rollout
- Idempotent writes for queue and usage pipelines
