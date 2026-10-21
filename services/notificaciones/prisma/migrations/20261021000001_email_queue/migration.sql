-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "sent_emails" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimed_until" TIMESTAMPTZ(3),
ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "html" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "send_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "EmailStatus" NOT NULL DEFAULT 'SENT',
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "text" TEXT,
ALTER COLUMN "sent_at" DROP NOT NULL,
ALTER COLUMN "sent_at" DROP DEFAULT;

-- The rows before the queue are account emails, sent already: one per event.
UPDATE "sent_emails" SET "dedupe_key" = 'account-link:' || "event_id";
ALTER TABLE "sent_emails" ALTER COLUMN "dedupe_key" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- A queued email carries its content; only the account emails, already sent, are stored without it.
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_pending_has_content"
  CHECK ("status" <> 'PENDING' OR ("subject" IS NOT NULL AND "html" IS NOT NULL AND "text" IS NOT NULL));

-- CreateTable
CREATE TABLE "ticket_copies" (
    "ticket_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "seats" INTEGER[],
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ticket_copies_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateTable
CREATE TABLE "cancelled_trips" (
    "trip_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancelled_trips_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "driver_licenses" (
    "driver_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_expires_on" DATE NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "driver_licenses_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "branch_admins" (
    "user_id" UUID NOT NULL,
    "branch_id" UUID,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "branch_admins_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "ticket_copies_trip_id_idx" ON "ticket_copies"("trip_id");

-- CreateIndex
CREATE INDEX "driver_licenses_branch_id_idx" ON "driver_licenses"("branch_id");

-- CreateIndex
CREATE INDEX "branch_admins_branch_id_idx" ON "branch_admins"("branch_id");

-- CreateIndex
CREATE INDEX "sent_emails_status_send_after_idx" ON "sent_emails"("status", "send_after");

-- CreateIndex
CREATE UNIQUE INDEX "sent_emails_dedupe_key_recipient_key" ON "sent_emails"("dedupe_key", "recipient");

