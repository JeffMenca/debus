-- CreateEnum
CREATE TYPE "WalletMovementKind" AS ENUM ('TOP_UP', 'TICKET', 'RENTAL', 'REFUND');

-- CreateTable
CREATE TABLE "client_profiles" (
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "dpi" TEXT,
    "phone" TEXT,
    "nit" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "client_id" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "wallet_movements" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "WalletMovementKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "reference" UUID,
    "description" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_versions" (
    "id" UUID NOT NULL,
    "depreciation_per_km" DECIMAL(10,2) NOT NULL,
    "rental_rate_per_km" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_movements_client_id_created_at_id_idx" ON "wallet_movements"("client_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_movements_client_id_idempotency_key_key" ON "wallet_movements"("client_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "settings_versions_effective_from_created_at_idx" ON "settings_versions"("effective_from", "created_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wallets"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A wallet never goes below zero, however many debits arrive together.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);

-- A NIT belongs to one profile; profiles without one are not limited.
CREATE UNIQUE INDEX "client_profiles_nit_key" ON "client_profiles"("nit") WHERE "nit" IS NOT NULL;
