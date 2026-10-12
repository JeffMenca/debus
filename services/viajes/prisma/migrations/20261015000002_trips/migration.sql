-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('REGULAR', 'RENTAL');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'COMPLETED');

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "type" "TripType" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "branch_id" UUID NOT NULL,
    "route_id" UUID,
    "bus_id" UUID NOT NULL,
    "bus_plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "driver_id" UUID NOT NULL,
    "driver_name" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "estimated_arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "ticket_price" DECIMAL(10,2),
    "rental_id" UUID,
    "created_by_id" UUID NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_branch_id_departure_at_idx" ON "trips"("branch_id", "departure_at");

-- CreateIndex
CREATE INDEX "trips_bus_id_idx" ON "trips"("bus_id");

-- CreateIndex
CREATE INDEX "trips_driver_id_idx" ON "trips"("driver_id");

-- btree_gist is a trusted extension: the owner of the database (the service role) may create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE trips ADD CONSTRAINT trips_arrival_after_departure CHECK (estimated_arrival_at > departure_at);
-- No bus and no driver can be in two trips whose windows cross, even with simultaneous requests.
-- '[)' lets a trip start exactly when the previous one arrives.
ALTER TABLE trips ADD CONSTRAINT trips_bus_no_overlap
  EXCLUDE USING gist (bus_id WITH =, tstzrange(departure_at, estimated_arrival_at, '[)') WITH &&);
ALTER TABLE trips ADD CONSTRAINT trips_driver_no_overlap
  EXCLUDE USING gist (driver_id WITH =, tstzrange(departure_at, estimated_arrival_at, '[)') WITH &&);

CREATE FUNCTION trips_type_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.type <> OLD.type THEN
    RAISE EXCEPTION 'The type of a trip cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trips_type_immutable BEFORE UPDATE OF type ON trips
  FOR EACH ROW EXECUTE FUNCTION trips_type_immutable();

CREATE FUNCTION fold_search_text(value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(translate(value, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) $$;
CREATE FUNCTION trips_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.origin_label || ' ' || NEW.destination_label || ' ' || NEW.bus_plate || ' ' || NEW.driver_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trips_search_text BEFORE INSERT OR UPDATE OF origin_label, destination_label, bus_plate, driver_name ON trips
  FOR EACH ROW EXECUTE FUNCTION trips_search_text();
