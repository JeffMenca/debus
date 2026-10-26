
-- CreateTable
CREATE TABLE "refunds" (
    "reference" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "movement_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("reference")
);

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

