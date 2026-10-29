-- CreateEnum
CREATE TYPE "VirusTotalStatus" AS ENUM ('PENDING', 'CLEAN', 'SUSPICIOUS', 'MALICIOUS', 'NOT_SCANNED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FILE_FLAGGED';

-- AlterTable
ALTER TABLE "ModFile" ADD COLUMN     "vtAnalysisId" TEXT,
ADD COLUMN     "vtCheckedAt" TIMESTAMP(3),
ADD COLUMN     "vtEngines" INTEGER,
ADD COLUMN     "vtLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "vtMalicious" INTEGER,
ADD COLUMN     "vtStatus" "VirusTotalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "vtSuspicious" INTEGER;

-- CreateIndex
CREATE INDEX "ModFile_vtStatus_vtLastAttemptAt_idx" ON "ModFile"("vtStatus", "vtLastAttemptAt");

