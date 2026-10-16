-- Copy of the NIT of every client profile (ProfileUpdated); counter sales with that NIT link to it.
CREATE TABLE "client_nits" (
    "client_id" UUID NOT NULL,
    "nit" TEXT,
    "full_name" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_nits_pkey" PRIMARY KEY ("client_id")
);

CREATE INDEX "client_nits_nit_idx" ON "client_nits"("nit");
