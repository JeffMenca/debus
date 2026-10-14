-- CreateEnum
CREATE TYPE "RepairLineKind" AS ENUM ('LABOR', 'PART');

-- CreateEnum
CREATE TYPE "TripCostType" AS ENUM ('REGULAR', 'RENTAL');

-- CreateTable
CREATE TABLE "bus_copies" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bus_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_expenses" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "bus_plate" TEXT NOT NULL,
    "service_date" DATE NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "labor_total" DECIMAL(12,2) NOT NULL,
    "parts_total" DECIMAL(12,2) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_expense_lines" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "kind" "RepairLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "repair_expense_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_costs" (
    "trip_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "trip_type" "TripCostType" NOT NULL,
    "arrived_at" TIMESTAMPTZ(3) NOT NULL,
    "distance_km" INTEGER NOT NULL,
    "fuel_cost" DECIMAL(10,2) NOT NULL,
    "depreciation_per_km" DECIMAL(10,2) NOT NULL,
    "depreciation_amount" DECIMAL(12,2) NOT NULL,
    "driver_pay" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_costs_pkey" PRIMARY KEY ("trip_id")
);

-- CreateIndex
CREATE INDEX "bus_copies_branch_id_active_idx" ON "bus_copies"("branch_id", "active");

-- CreateIndex
CREATE INDEX "repair_expenses_branch_id_service_date_id_idx" ON "repair_expenses"("branch_id", "service_date", "id");

-- CreateIndex
CREATE INDEX "repair_expenses_bus_id_idx" ON "repair_expenses"("bus_id");

-- CreateIndex
CREATE INDEX "repair_expense_lines_expense_id_idx" ON "repair_expense_lines"("expense_id");

-- CreateIndex
CREATE INDEX "repair_expense_lines_category_id_idx" ON "repair_expense_lines"("category_id");

-- CreateIndex
CREATE INDEX "trip_costs_branch_id_arrived_at_idx" ON "trip_costs"("branch_id", "arrived_at");

-- AddForeignKey
ALTER TABLE "repair_expense_lines" ADD CONSTRAINT "repair_expense_lines_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "repair_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_expense_lines" ADD CONSTRAINT "repair_expense_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A category name is unique whatever its case: "Llantas" and "llantas" are the same category.
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories" (lower("name"));

-- Searches look at search_text, which the database keeps in step with the searchable columns.
CREATE FUNCTION expense_categories_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER expense_categories_search_text BEFORE INSERT OR UPDATE OF name ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION expense_categories_search_text();

CREATE FUNCTION repair_expenses_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.bus_plate);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER repair_expenses_search_text BEFORE INSERT ON repair_expenses
  FOR EACH ROW EXECUTE FUNCTION repair_expenses_search_text();

-- The catalog from the statement; more categories are added from the screen, never in code.
INSERT INTO expense_categories (id, name, updated_at) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Llantas', now()),
  ('a1000000-0000-4000-8000-000000000002', 'Motor', now()),
  ('a1000000-0000-4000-8000-000000000003', 'Frenos', now()),
  ('a1000000-0000-4000-8000-000000000004', 'Suspensión', now()),
  ('a1000000-0000-4000-8000-000000000005', 'Cambio de aceite', now()),
  ('a1000000-0000-4000-8000-000000000006', 'Eléctrico', now()),
  ('a1000000-0000-4000-8000-000000000007', 'Carrocería', now()),
  ('a1000000-0000-4000-8000-000000000008', 'Otros', now());
