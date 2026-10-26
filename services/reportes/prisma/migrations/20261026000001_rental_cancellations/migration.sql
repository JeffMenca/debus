-- CreateTable
CREATE TABLE "branch_report_rental_cancellations" (
    "rental_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branch_report_rental_cancellations_pkey" PRIMARY KEY ("rental_id")
);

