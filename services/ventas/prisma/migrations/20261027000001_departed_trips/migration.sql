-- CreateTable
CREATE TABLE "departed_trips" (
    "trip_id" UUID NOT NULL,
    "departed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departed_trips_pkey" PRIMARY KEY ("trip_id")
);
