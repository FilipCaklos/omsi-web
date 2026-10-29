-- CreateTable
CREATE TABLE "UserDownload" (
    "userId" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "versionId" TEXT,
    "notifyUpdates" BOOLEAN NOT NULL DEFAULT true,
    "firstDownloadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDownloadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDownload_pkey" PRIMARY KEY ("userId","modId")
);

-- CreateIndex
CREATE INDEX "UserDownload_modId_idx" ON "UserDownload"("modId");

-- CreateIndex
CREATE INDEX "UserDownload_userId_lastDownloadAt_idx" ON "UserDownload"("userId", "lastDownloadAt" DESC);

-- AddForeignKey
ALTER TABLE "UserDownload" ADD CONSTRAINT "UserDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDownload" ADD CONSTRAINT "UserDownload_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDownload" ADD CONSTRAINT "UserDownload_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

