-- CreateEnum
CREATE TYPE "RecordedByRole" AS ENUM ('BRANCH_ADMIN', 'DRIVER');

-- CreateEnum
CREATE TYPE "RentalRequestStatus" AS ENUM ('PENDING', 'ASSIGNED');

-- AlterTable
ALTER TABLE "bus_copies" ADD COLUMN     "mileage_km" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "trip_departures" (
    "trip_id" UUID NOT NULL,
    "departed_at" TIMESTAMPTZ(3) NOT NULL,
    "start_mileage_km" INTEGER NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "recorded_by_role" "RecordedByRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_departures_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "trip_arrivals" (
    "trip_id" UUID NOT NULL,
    "arrived_at" TIMESTAMPTZ(3) NOT NULL,
    "end_mileage_km" INTEGER NOT NULL,
    "fuel_cost" DECIMAL(10,2) NOT NULL,
    "distance_km" INTEGER NOT NULL,
    "depreciation_per_km" DECIMAL(10,2) NOT NULL,
    "depreciation_amount" DECIMAL(12,2) NOT NULL,
    "driver_pay" DECIMAL(10,2) NOT NULL,
    "settings_version_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "recorded_by_role" "RecordedByRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_arrivals_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "rental_requests" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "client_name" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "return_at" TIMESTAMPTZ(3),
    "passengers" INTEGER NOT NULL,
    "distance_km" DECIMAL(7,1) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "RentalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "trip_id" UUID,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rental_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_requests_trip_id_key" ON "rental_requests"("trip_id");

-- CreateIndex
CREATE INDEX "rental_requests_branch_id_status_departure_at_idx" ON "rental_requests"("branch_id", "status", "departure_at");

-- AddForeignKey
ALTER TABLE "trip_departures" ADD CONSTRAINT "trip_departures_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_arrivals" ADD CONSTRAINT "trip_arrivals_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A departure and an arrival are history: the database refuses to change or remove them.
CREATE FUNCTION trip_departures_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'trip departures cannot be changed';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trip_departures_immutable BEFORE UPDATE OR DELETE ON "trip_departures"
  FOR EACH ROW EXECUTE FUNCTION trip_departures_immutable();

CREATE FUNCTION trip_arrivals_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'trip arrivals cannot be changed';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trip_arrivals_immutable BEFORE UPDATE OR DELETE ON "trip_arrivals"
  FOR EACH ROW EXECUTE FUNCTION trip_arrivals_immutable();

CREATE FUNCTION rental_requests_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.client_name || ' ' || NEW.nit || ' ' || NEW.origin_label || ' ' || NEW.destination_label);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER rental_requests_search_text BEFORE INSERT OR UPDATE OF client_name, nit, origin_label, destination_label ON rental_requests
  FOR EACH ROW EXECUTE FUNCTION rental_requests_search_text();
