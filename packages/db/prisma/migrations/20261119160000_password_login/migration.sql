ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
CREATE TABLE "auth_rate_limits" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "auth_rate_limits_expires_at_idx" ON "auth_rate_limits"("expires_at");
