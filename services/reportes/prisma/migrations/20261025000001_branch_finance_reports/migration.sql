-- CreateTable
CREATE TABLE "branch_report_depreciation_rates" (
    "id" UUID NOT NULL,
    "depreciation_per_km" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branch_report_depreciation_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_report_repair_lines" (
    "expense_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "branch_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "category_id" UUID NOT NULL,
    "category_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "branch_report_repair_lines_pkey" PRIMARY KEY ("expense_id","line_no")
);

-- CreateTable
CREATE TABLE "branch_report_ticket_sales" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "sold_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branch_report_ticket_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_report_rentals" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "client_id" UUID,
    "nit" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "return_at" TIMESTAMPTZ(3),
    "passengers" INTEGER NOT NULL,
    "distance_km" DECIMAL(6,1) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "branch_report_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_report_depreciation_rates_effective_from_idx" ON "branch_report_depreciation_rates"("effective_from");

-- CreateIndex
CREATE INDEX "branch_report_repair_lines_branch_id_service_date_idx" ON "branch_report_repair_lines"("branch_id", "service_date");

-- CreateIndex
CREATE INDEX "branch_report_repair_lines_bus_id_idx" ON "branch_report_repair_lines"("bus_id");

-- CreateIndex
CREATE INDEX "branch_report_ticket_sales_branch_id_paid_on_idx" ON "branch_report_ticket_sales"("branch_id", "paid_on");

-- CreateIndex
CREATE INDEX "branch_report_ticket_sales_trip_id_idx" ON "branch_report_ticket_sales"("trip_id");

-- CreateIndex
CREATE INDEX "branch_report_rentals_branch_id_paid_on_idx" ON "branch_report_rentals"("branch_id", "paid_on");

-- search_text is folded by the database, the same way for every writer (fold_search_text).
CREATE FUNCTION branch_report_rentals_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(
    NEW.client_name || ' ' || NEW.nit || ' ' || NEW.origin_label || ' ' || NEW.destination_label);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER branch_report_rentals_search_text BEFORE INSERT OR UPDATE ON branch_report_rentals
  FOR EACH ROW EXECUTE FUNCTION branch_report_rentals_search_text();
