-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_versions" (
    "id" UUID NOT NULL,
    "depreciation_per_km" DECIMAL(10,2) NOT NULL,
    "rental_rate_per_km" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settings_versions_effective_from_created_at_idx" ON "settings_versions"("effective_from", "created_at");
