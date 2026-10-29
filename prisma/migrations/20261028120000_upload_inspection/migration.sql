-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "archiveEntries" JSONB,
ADD COLUMN     "archiveEntryCount" INTEGER,
ADD COLUMN     "archiveFormat" "ArchiveFormat",
ADD COLUMN     "archiveUncompressedBytes" BIGINT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "omsiFolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scanNotes" JSONB,
ADD COLUMN     "scanStatus" "ScanStatus",
ADD COLUMN     "storageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_storageKey_key" ON "UploadSession"("storageKey");

