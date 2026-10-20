-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('ONLINE', 'COUNTER');

-- CreateTable
CREATE TABLE "trips" (
    "trip_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "bus_plate" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "ticket_price" DECIMAL(10,2) NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "estimated_arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "search_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "channel" "SaleChannel" NOT NULL,
    "client_id" UUID,
    "nit" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "email" TEXT,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_seats" (
    "trip_id" UUID NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "ticket_id" UUID NOT NULL,

    CONSTRAINT "ticket_seats_pkey" PRIMARY KEY ("trip_id","seat_number")
);

-- CreateIndex
CREATE INDEX "trips_departure_at_trip_id_idx" ON "trips"("departure_at", "trip_id");

-- CreateIndex
CREATE INDEX "tickets_client_id_created_at_id_idx" ON "tickets"("client_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "tickets_nit_idx" ON "tickets"("nit");

-- CreateIndex
CREATE INDEX "ticket_seats_ticket_id_idx" ON "ticket_seats"("ticket_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_seats" ADD CONSTRAINT "ticket_seats_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_seats" ADD CONSTRAINT "ticket_seats_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A seat number starts at one; the upper bound is the capacity of the trip, checked on reserving.
ALTER TABLE "ticket_seats" ADD CONSTRAINT "ticket_seats_seat_number_positive" CHECK ("seat_number" >= 1);
