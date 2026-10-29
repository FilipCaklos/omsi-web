-- AlterTable
ALTER TABLE "MediaImage" ADD COLUMN     "storageDriver" "StorageDriver" NOT NULL DEFAULT 'LOCAL_DISK';

-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "storageDriver" "StorageDriver";
