-- CreateTable
CREATE TABLE "system_report_routes" (
    "id" UUID NOT NULL,
    "origin_branch_id" UUID,
    "destination_branch_id" UUID,
    "distance_km" DECIMAL(7,1) NOT NULL,
    "ticket_price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_report_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_report_routes_origin_branch_id_idx" ON "system_report_routes"("origin_branch_id");
