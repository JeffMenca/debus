-- CreateTable
CREATE TABLE "bus_copies" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "operational_status" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "assigned_driver_id" UUID,
    "version" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bus_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_copies" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_expires_on" DATE NOT NULL,
    "base_salary" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_copies" (
    "id" UUID NOT NULL,
    "origin_branch_id" UUID,
    "destination_branch_id" UUID,
    "distance_km" DECIMAL(7,1) NOT NULL,
    "ticket_price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_copies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bus_copies_branch_id_active_idx" ON "bus_copies"("branch_id", "active");

-- CreateIndex
CREATE INDEX "driver_copies_branch_id_active_idx" ON "driver_copies"("branch_id", "active");

-- CreateIndex
CREATE INDEX "route_copies_origin_branch_id_active_idx" ON "route_copies"("origin_branch_id", "active");
