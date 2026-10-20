-- The record of every purchase made with the wallet (saga of the purchase). It survives the
-- compensation: a failed purchase deletes its ticket, not this row.
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

CREATE TYPE "PurchaseFailure" AS ENUM ('INSUFFICIENT_BALANCE', 'PAYMENT_EXPIRED', 'WALLET_NOT_READY', 'WALLET_UNAVAILABLE', 'PAYMENT_REJECTED', 'TRIP_CANCELLED');

CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "seats" INTEGER[],
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "pay_by" TIMESTAMPTZ(3) NOT NULL,
    "status" "PurchaseStatus" NOT NULL,
    "failure" "PurchaseFailure",
    "debit_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchases_failure_matches_status" CHECK (("status" = 'FAILED') = ("failure" IS NOT NULL))
);

CREATE INDEX "purchases_status_updated_at_id_idx" ON "purchases"("status", "updated_at", "id");

CREATE INDEX "purchases_client_id_created_at_id_idx" ON "purchases"("client_id", "created_at" DESC, "id" DESC);
