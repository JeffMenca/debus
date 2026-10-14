-- CreateTable
CREATE TABLE "branch_report_buses" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "operational_status" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "assigned_driver_id" UUID,
    "mileage_km" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_report_buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_report_drivers" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_type" TEXT NOT NULL,
    "license_expires_on" DATE NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_report_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_report_trips" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "type" TEXT,
    "route_id" UUID,
    "rental_id" UUID,
    "bus_plate" TEXT,
    "origin_label" TEXT,
    "destination_label" TEXT,
    "departure_at" TIMESTAMPTZ(3),
    "departed_at" TIMESTAMPTZ(3),
    "arrived_at" TIMESTAMPTZ(3),
    "start_mileage_km" INTEGER,
    "end_mileage_km" INTEGER,
    "fuel_cost" DECIMAL(12,2),
    "depreciation_per_km" DECIMAL(12,2),
    "depreciation_amount" DECIMAL(12,2),
    "deleted_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_report_trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_report_buses_branch_id_plate_id_idx" ON "branch_report_buses"("branch_id", "plate", "id");

-- CreateIndex
CREATE INDEX "branch_report_drivers_branch_id_full_name_id_idx" ON "branch_report_drivers"("branch_id", "full_name", "id");

-- CreateIndex
CREATE INDEX "branch_report_trips_branch_id_arrived_at_idx" ON "branch_report_trips"("branch_id", "arrived_at");

-- CreateIndex
CREATE INDEX "branch_report_trips_bus_id_idx" ON "branch_report_trips"("bus_id");

-- CreateIndex
CREATE INDEX "branch_report_trips_driver_id_idx" ON "branch_report_trips"("driver_id");

-- CreateIndex
CREATE INDEX "branch_report_trips_rental_id_idx" ON "branch_report_trips"("rental_id");

-- search_text is folded by the database, the same way for every writer (fold_search_text).
CREATE FUNCTION branch_report_buses_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.plate || ' ' || NEW.brand || ' ' || NEW.model);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER branch_report_buses_search_text BEFORE INSERT OR UPDATE ON branch_report_buses
  FOR EACH ROW EXECUTE FUNCTION branch_report_buses_search_text();

CREATE FUNCTION branch_report_drivers_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.full_name || ' ' || NEW.license_number);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER branch_report_drivers_search_text BEFORE INSERT OR UPDATE ON branch_report_drivers
  FOR EACH ROW EXECUTE FUNCTION branch_report_drivers_search_text();
