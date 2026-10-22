-- CreateEnum
CREATE TYPE "RentalChannel" AS ENUM ('ONLINE', 'COUNTER');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "rentals" (
    "id" UUID NOT NULL,
    "channel" "RentalChannel" NOT NULL,
    "status" "RentalStatus" NOT NULL,
    "branch_id" UUID NOT NULL,
    "client_id" UUID,
    "nit" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "email" TEXT,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "return_at" TIMESTAMPTZ(3),
    "passengers" INTEGER NOT NULL,
    "distance_km" DECIMAL(7,1) NOT NULL,
    "rate_per_km" DECIMAL(10,2) NOT NULL,
    "estimated_price" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2),
    "search_text" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" UUID,
    "paid_on" DATE,
    "paid_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "rentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rentals_client_id_requested_at_id_idx" ON "rentals"("client_id", "requested_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "rentals_nit_requested_at_id_idx" ON "rentals"("nit", "requested_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "rentals_branch_id_status_departure_at_id_idx" ON "rentals"("branch_id", "status", "departure_at", "id");

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An online rental always belongs to a client; a counter one never does.
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_channel_client" CHECK (("channel" = 'ONLINE') = ("client_id" IS NOT NULL));
-- A confirmed or paid rental always has its price; a request may be cancelled before getting one.
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_price_when_confirmed" CHECK ("status" NOT IN ('CONFIRMED', 'PAID') OR "price" IS NOT NULL);
-- A paid rental has its payment day and moment; a cancelled one keeps them if it had been paid.
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_paid_fields" CHECK (("paid_on" IS NULL) = ("paid_at" IS NULL) AND ("status" <> 'PAID' OR "paid_on" IS NOT NULL));
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_return_after_departure" CHECK ("return_at" IS NULL OR "return_at" > "departure_at");
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_positive_amounts" CHECK ("passengers" > 0 AND "distance_km" > 0 AND "rate_per_km" > 0 AND "estimated_price" > 0 AND ("price" IS NULL OR "price" > 0));
