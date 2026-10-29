-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUTHOR_NEW_MOD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discordUrl" TEXT,
ADD COLUMN     "donateUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- CreateTable
CREATE TABLE "AuthorFollow" (
    "followerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorFollow_pkey" PRIMARY KEY ("followerId","authorId")
);

-- CreateIndex
CREATE INDEX "AuthorFollow_authorId_idx" ON "AuthorFollow"("authorId");

-- AddForeignKey
ALTER TABLE "AuthorFollow" ADD CONSTRAINT "AuthorFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorFollow" ADD CONSTRAINT "AuthorFollow_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

