-- AlterEnum
ALTER TYPE "ImageKind" ADD VALUE 'COMMUNITY';

-- AlterTable
ALTER TABLE "MediaImage" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MediaImage_kind_approvedAt_idx" ON "MediaImage"("kind", "approvedAt");

