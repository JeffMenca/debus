-- CreateTable
CREATE TABLE "deleted_trips" (
    "trip_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_trips_pkey" PRIMARY KEY ("trip_id")
);
