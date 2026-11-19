-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reporting_timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "shop_currency" TEXT,
    "currency_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "account_ref" TEXT,
    "status" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret_ref" TEXT,
    "last_probe_at" TIMESTAMP(3),
    "last_probe_ok" BOOLEAN,
    "last_error" TEXT,
    "account_timezone" TEXT,
    "currency" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "source_version" TEXT NOT NULL,
    "error" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_cursors" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "watermark" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "account_ref" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'shopify',
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price_ex_vat_minor" INTEGER NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "location_ref" TEXT NOT NULL,
    "available" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'shopify',
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at_source" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL,
    "shipping_ex_vat_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" INTEGER NOT NULL DEFAULT 0,
    "source_version" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_ex_vat_minor" INTEGER NOT NULL,
    "discount_ex_vat_minor" INTEGER NOT NULL DEFAULT 0,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_lines" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount_ex_vat_minor" INTEGER NOT NULL,
    "refunded_at" TIMESTAMP(3) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refund_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_entries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insights" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "account_ref" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date_local" TEXT NOT NULL,
    "account_timezone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "attribution_window" TEXT NOT NULL,
    "action_report_time" TEXT NOT NULL,
    "breakdown_key" TEXT NOT NULL DEFAULT 'none',
    "spend_minor" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "link_clicks" INTEGER NOT NULL,
    "purchases" INTEGER NOT NULL,
    "purchase_value_minor" INTEGER NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ad_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "klaviyo_reports" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "conversion_metric_id" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "unsubscribes" INTEGER NOT NULL,
    "conversions" INTEGER NOT NULL,
    "attributed_revenue_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "klaviyo_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarity_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "dimensions" TEXT[],
    "query_hash" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "rows" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "clarity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "currency" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "numerator" DOUBLE PRECISION,
    "denominator" DOUBLE PRECISION,
    "filters" JSONB NOT NULL,
    "source_record_ids" TEXT[],
    "notes" TEXT[],
    "contract_version" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "task_id" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "wait_reason" TEXT,
    "rate_limit_until" TIMESTAMP(3),
    "input" JSONB NOT NULL DEFAULT '{}',
    "parent_task_id" TEXT,
    "created_by_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 2,
    "lease_owner" TEXT,
    "lease_until" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "progress_at" TIMESTAMP(3),
    "progress_note" TEXT,
    "deadline_at" TIMESTAMP(3),
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "result_artifact_id" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "depends_on_id" TEXT NOT NULL,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model_provider" TEXT NOT NULL,
    "model_alias" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "repair_attempted" BOOLEAN NOT NULL DEFAULT false,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd_micros" INTEGER NOT NULL DEFAULT 0,
    "tool_calls" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" SERIAL NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "task_id" TEXT,
    "meeting_id" TEXT,
    "agent_role" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "time_of_day" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "timezone" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "grace_minutes" INTEGER NOT NULL DEFAULT 10,
    "max_catch_up_minutes" INTEGER NOT NULL DEFAULT 180,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_firings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "planned_at" TIMESTAMP(3) NOT NULL,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL,
    "ref_id" TEXT,

    CONSTRAINT "schedule_firings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT,
    "kind" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_refs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "ref_kind" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "evidence_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "metric_snapshot_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_proposals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "account_ref" TEXT NOT NULL,
    "target_object" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "preconditions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "risk" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "source_task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "action_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "decided_by_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "note" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner_name" TEXT,
    "source" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "schedule_key" TEXT,
    "meeting_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "planned_at" TIMESTAMP(3) NOT NULL,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "since_at" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "synthesis" JSONB,
    "synthesis_error" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "attendance" TEXT NOT NULL,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_updates" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "done" JSONB NOT NULL,
    "current" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "next_step" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "stale_input" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "meeting_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_actions" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "owner_role" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "meeting_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchdog_alerts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "watchdog_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "worker_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "last_beat_at" TIMESTAMP(3) NOT NULL,
    "info" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("worker_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "connections_workspace_id_provider_key" ON "connections"("workspace_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "sync_cursors_workspace_id_provider_resource_key" ON "sync_cursors"("workspace_id", "provider", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_receipts_provider_account_ref_event_id_key" ON "webhook_receipts"("provider", "account_ref", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_workspace_id_provider_external_id_key" ON "products"("workspace_id", "provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "variants_workspace_id_external_id_key" ON "variants"("workspace_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_workspace_id_provider_external_id_key" ON "orders"("workspace_id", "provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_lines_workspace_id_external_id_key" ON "order_lines"("workspace_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_lines_workspace_id_external_id_key" ON "refund_lines"("workspace_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_insights_workspace_id_provider_account_ref_level_externa_key" ON "ad_insights"("workspace_id", "provider", "account_ref", "level", "external_id", "date_local", "breakdown_key", "attribution_window");

-- CreateIndex
CREATE INDEX "tasks_workspace_id_status_idx" ON "tasks"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_task_id_depends_on_id_key" ON "task_dependencies"("task_id", "depends_on_id");

-- CreateIndex
CREATE INDEX "task_events_workspace_id_id_idx" ON "task_events"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_workspace_id_key_key" ON "schedules"("workspace_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_firings_schedule_id_planned_at_key" ON "schedule_firings"("schedule_id", "planned_at");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_proposal_id_key" ON "approvals"("proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_workspace_id_slug_key" ON "knowledge_documents"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_workspace_id_meeting_key_key" ON "meetings"("workspace_id", "meeting_key");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meeting_id_agent_role_key" ON "meeting_participants"("meeting_id", "agent_role");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meeting_id_seat_index_key" ON "meeting_participants"("meeting_id", "seat_index");

-- CreateIndex
CREATE INDEX "watchdog_alerts_workspace_id_status_idx" ON "watchdog_alerts"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_lines" ADD CONSTRAINT "refund_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_firings" ADD CONSTRAINT "schedule_firings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "action_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_updates" ADD CONSTRAINT "meeting_updates_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
