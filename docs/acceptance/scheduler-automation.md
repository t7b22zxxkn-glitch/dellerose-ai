# Scheduler automation acceptance checklist (v1.1)

Use this checklist before releasing scheduler automation changes.

## Scope

Validates:

- publish job enqueueing
- idempotency behavior
- retry/dead-letter behavior
- manual fallback continuity
- RLS/user isolation
- observability completeness

---

## Preconditions

- [ ] You are logged in as test user A
- [ ] Supabase schema includes `publish_jobs`
- [ ] At least one workflow exists with an approved draft
- [ ] Branch is up-to-date and app starts successfully

---

## 1) Scheduling creates a publish job

Steps:

1. Open Scheduler
2. Pick a `pending` item
3. Set a date and click **Sæt som scheduled**

Expected:

- [ ] Post plan status becomes `scheduled`
- [ ] A `publish_jobs` row exists
- [ ] Job status is `queued`
- [ ] UI shows job status and attempt counter

---

## 2) Idempotency (no duplicate jobs)

Steps:

1. Repeat scheduling on same workflow/platform/date

Expected:

- [ ] No duplicate `publish_jobs` row for same idempotency key
- [ ] Existing job is reused

---

## 3) Worker picks due jobs

Steps:

1. Make sure job is due (`next_retry_at <= now` or `queued`)
2. Trigger worker/cron run

Expected:

- [ ] Job transitions to `processing`
- [ ] Job is handled exactly once per attempt

---

## 4) Success path

Steps:

1. Run a successful publish attempt

Expected:

- [ ] Job becomes `published`
- [ ] `published_at` is populated
- [ ] Post status is `posted`
- [ ] `next_retry_at` and `last_error` are cleared

---

## 5) Retryable failure path

Steps:

1. Trigger a retryable failure (for example timeout/temporary API outage)

Expected:

- [ ] Job becomes `retrying`
- [ ] `attempt_count` increments
- [ ] `next_retry_at` is set in the future
- [ ] `last_error` is stored

---

## 6) Dead-letter / terminal failure

Steps:

1. Force fatal failure or exceed max attempts

Expected:

- [ ] Job becomes `failed`
- [ ] `dead_lettered_at` is populated
- [ ] Job is no longer auto-retried

---

## 7) Manual fallback still works

Steps:

1. Use **Kopiér til manuel posting**
2. Mark content as posted manually

Expected:

- [ ] Manual copy flow still works end-to-end
- [ ] No regression in existing scheduler behavior

---

## 8) RLS isolation check

Steps:

1. Login as user B
2. Try to access user A workflows/jobs

Expected:

- [ ] User B cannot read or mutate user A `publish_jobs`
- [ ] No data leakage in UI or action responses

---

## 9) Observability check

Steps:

1. Execute one successful and one failing scheduler action
2. Inspect logs

Expected:

- [ ] Log contains `request_id`, `action_name`, `latency_ms`
- [ ] Log includes `user_id`, `workflow_id`, `platform` when available
- [ ] Failures include `error_code`, `error_type`, `retryable`
- [ ] No secrets appear in logs

---

## Release gate

All must pass before release:

- [ ] Checklist sections 1-9 pass
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] Changes committed and pushed
