-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_versions" (
    "id" UUID NOT NULL,
    "depreciation_per_km" DECIMAL(10,2) NOT NULL,
    "rental_rate_per_km" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE INDEX "settings_versions_effective_from_created_at_idx" ON "settings_versions"("effective_from", "created_at");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- No branch existed before this migration, so any branch_id is test residue; those accounts cannot sign in.
UPDATE "users" SET "branch_id" = NULL, "status" = 'INACTIVE' WHERE "branch_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A settings version is history: changing the rate means adding a new version.
CREATE FUNCTION settings_versions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'settings versions cannot be changed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_versions_immutable
  BEFORE UPDATE OR DELETE ON "settings_versions"
  FOR EACH ROW EXECUTE FUNCTION settings_versions_immutable();
