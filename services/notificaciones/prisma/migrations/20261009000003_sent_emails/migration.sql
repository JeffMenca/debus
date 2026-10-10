-- CreateTable
CREATE TABLE "sent_emails" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sent_emails_recipient_idx" ON "sent_emails"("recipient");
