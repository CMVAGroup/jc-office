CREATE TABLE "cmva_daily_metrics" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "store_profile" TEXT NOT NULL,
  "date_local" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "value_minor" BIGINT,
  "unit" TEXT NOT NULL,
  "source_currency" TEXT NOT NULL,
  "source_timezone" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "source_version" TEXT NOT NULL,
  "date_assumption" TEXT NOT NULL,
  "is_demo" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "cmva_daily_metrics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cmva_daily_metric_scope_key"
  ON "cmva_daily_metrics"("workspace_id", "store_profile", "date_local", "metric");
