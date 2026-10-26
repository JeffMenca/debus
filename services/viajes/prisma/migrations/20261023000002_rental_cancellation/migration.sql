-- AlterEnum
ALTER TYPE "RentalRequestStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "rental_requests" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3);

