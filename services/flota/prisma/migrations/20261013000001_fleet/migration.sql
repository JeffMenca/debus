-- CreateEnum
CREATE TYPE "BusOperationalStatus" AS ENUM ('AVAILABLE', 'IN_WORKSHOP');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('A', 'B', 'C', 'M', 'E');

-- CreateEnum
CREATE TYPE "TripCopyStatus" AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'COMPLETED');

-- CreateTable
CREATE TABLE "buses" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "mileage_km" INTEGER NOT NULL,
    "operational_status" "BusOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "in_transit" BOOLEAN NOT NULL DEFAULT false,
    "completed_trips" INTEGER NOT NULL DEFAULT 0,
    "assigned_driver_id" UUID,
    "photo_key" TEXT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_type" "LicenseType" NOT NULL,
    "license_expires_on" DATE NOT NULL,
    "base_salary" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "completed_trips" INTEGER NOT NULL DEFAULT 0,
    "photo_key" TEXT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "origin_branch_id" UUID NOT NULL,
    "destination_branch_id" UUID NOT NULL,
    "distance_km" DECIMAL(7,1) NOT NULL,
    "ticket_price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "has_trips" BOOLEAN NOT NULL DEFAULT false,
    "search_text" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_copies" (
    "trip_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "route_id" UUID,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "estimated_arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "TripCopyStatus" NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_copies_pkey" PRIMARY KEY ("trip_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buses_plate_key" ON "buses"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "buses_assigned_driver_id_key" ON "buses"("assigned_driver_id");

-- CreateIndex
CREATE INDEX "buses_branch_id_active_in_transit_operational_status_idx" ON "buses"("branch_id", "active", "in_transit", "operational_status");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_number_key" ON "drivers"("license_number");

-- CreateIndex
CREATE INDEX "drivers_branch_id_active_idx" ON "drivers"("branch_id", "active");

-- CreateIndex
CREATE INDEX "drivers_branch_id_license_expires_on_idx" ON "drivers"("branch_id", "license_expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "routes_origin_branch_id_destination_branch_id_key" ON "routes"("origin_branch_id", "destination_branch_id");

-- CreateIndex
CREATE INDEX "trip_copies_bus_id_status_idx" ON "trip_copies"("bus_id", "status");

-- CreateIndex
CREATE INDEX "trip_copies_driver_id_status_idx" ON "trip_copies"("driver_id", "status");

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_origin_branch_id_fkey" FOREIGN KEY ("origin_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_copies" ADD CONSTRAINT "trip_copies_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_copies" ADD CONSTRAINT "trip_copies_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE routes ADD CONSTRAINT routes_distinct_branches CHECK (origin_branch_id <> destination_branch_id);
ALTER TABLE buses ADD CONSTRAINT buses_capacity_range CHECK (capacity BETWEEN 10 AND 80);

CREATE FUNCTION fold_search_text(value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(translate(value, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) $$;

CREATE FUNCTION buses_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.plate || ' ' || NEW.brand || ' ' || NEW.model);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER buses_search_text BEFORE INSERT OR UPDATE OF plate, brand, model ON buses
  FOR EACH ROW EXECUTE FUNCTION buses_search_text();

CREATE FUNCTION drivers_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.full_name || ' ' || NEW.license_number || ' ' || NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER drivers_search_text BEFORE INSERT OR UPDATE OF full_name, license_number, email ON drivers
  FOR EACH ROW EXECUTE FUNCTION drivers_search_text();

-- A route is searched by the name of its destination, which lives in the branch copy.
CREATE FUNCTION routes_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(COALESCE((SELECT name || ' ' || code FROM branches WHERE id = NEW.destination_branch_id), ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER routes_search_text BEFORE INSERT OR UPDATE OF destination_branch_id ON routes
  FOR EACH ROW EXECUTE FUNCTION routes_search_text();
