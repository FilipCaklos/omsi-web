-- OMSI Depo: počiatočná migrácia
-- 1) Rozšírenia pre vyhľadávanie bez ohľadu na diakritiku a veľkosť písmen
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2) IMMUTABLE obal nad unaccent – vyžadovaný pre indexy a trigger.
--    Explicitný slovník 'public.unaccent' zaručuje deterministický výsledok.
CREATE OR REPLACE FUNCTION omsi_normalize(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, input));
$$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'VERIFIED_CREATOR', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('sk', 'cs');

-- CreateEnum
CREATE TYPE "ModStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'PLANNED', 'SCHEDULED', 'PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'SCHEDULED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('MAIN', 'PATCH', 'OPTIONAL', 'OLD_VERSION');

-- CreateEnum
CREATE TYPE "StorageDriver" AS ENUM ('LOCAL_DISK', 'S3_COMPATIBLE');

-- CreateEnum
CREATE TYPE "ArchiveFormat" AS ENUM ('ZIP', 'SEVEN_Z', 'RAR', 'NONE');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REQUIRES_MOD_INSPECTION', 'REJECTED');

-- CreateEnum
CREATE TYPE "DependencyKind" AS ENUM ('STEAM_DLC', 'INTERNAL_MOD', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "CreditRole" AS ENUM ('MODEL', 'TEXTURES', 'SCRIPTS', 'SOUNDS', 'MAP', 'REPAINT', 'HOF', 'ANNOUNCEMENTS', 'TESTING', 'OTHER');

-- CreateEnum
CREATE TYPE "LicenseTerm" AS ENUM ('NO_REUPLOAD', 'MODIFY_WITH_PERMISSION', 'REPAINTS_ALLOWED', 'NO_COMMERCIAL_USE', 'CREDIT_REQUIRED', 'FREE_TO_MODIFY');

-- CreateEnum
CREATE TYPE "ReleaseMode" AS ENUM ('EXACT_DATE', 'WINDOW', 'TBA');

-- CreateEnum
CREATE TYPE "ReleaseWindowPart" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'H1', 'H2', 'YEAR');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('SCREENSHOT', 'DEVLOG', 'AVATAR');

-- CreateEnum
CREATE TYPE "OperatorCountry" AS ENUM ('SK', 'CZ', 'OTHER');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'CONFIRMED', 'IN_PROGRESS', 'FIXED', 'WONT_FIX', 'DUPLICATE', 'INVALID');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('MOD', 'FILE', 'REVIEW', 'COMMENT', 'USER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('STOLEN_CONTENT', 'MISSING_CREDITS', 'UNAUTHORIZED_REUPLOAD', 'BROKEN_ARCHIVE', 'SUSPICIOUS_FILE', 'SPAM', 'OFFENSIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'FILE_APPROVED', 'FILE_REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEVLOG_POSTED', 'MOD_RELEASED', 'NEW_VERSION', 'MOD_APPROVED', 'MOD_CHANGES_REQUESTED', 'MOD_REJECTED', 'BUG_REPORT_NEW', 'BUG_REPORT_STATUS', 'REVIEW_NEW', 'COMMENT_REPLY', 'REPORT_RESOLVED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADING', 'ASSEMBLING', 'SCANNING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('MOD_FILE', 'SCREENSHOT', 'DEVLOG_IMAGE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "locale" "Locale" NOT NULL DEFAULT 'sk',
    "bio" TEXT,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "bannedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "emailNotify" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameSk" TEXT NOT NULL,
    "nameCs" TEXT NOT NULL,
    "descriptionSk" TEXT NOT NULL DEFAULT '',
    "descriptionCs" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameSk" TEXT NOT NULL,
    "nameCs" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleBrand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" "OperatorCountry" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteamDlc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steamAppId" INTEGER,
    "storeUrl" TEXT,

    CONSTRAINT "SteamDlc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mod" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "descriptionHtml" TEXT NOT NULL DEFAULT '',
    "status" "ModStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "vehicleModel" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requires4GbPatch" BOOLEAN NOT NULL DEFAULT false,
    "licenseTerms" "LicenseTerm"[] DEFAULT ARRAY[]::"LicenseTerm"[],
    "licenseNote" TEXT,
    "youtubeVideoId" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "searchExtra" TEXT NOT NULL DEFAULT '',
    "searchText" TEXT NOT NULL DEFAULT '',
    "currentVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModBrand" (
    "modId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "ModBrand_pkey" PRIMARY KEY ("modId","brandId")
);

-- CreateTable
CREATE TABLE "ModOperator" (
    "modId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,

    CONSTRAINT "ModOperator_pkey" PRIMARY KEY ("modId","operatorId")
);

-- CreateTable
CREATE TABLE "ModCredit" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "role" "CreditRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModVersion" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT NOT NULL DEFAULT '',
    "changelogHtml" TEXT NOT NULL DEFAULT '',
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModFile" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "originalFilename" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageDriver" "StorageDriver" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "archiveFormat" "ArchiveFormat" NOT NULL DEFAULT 'NONE',
    "archiveEntries" JSONB,
    "archiveEntryCount" INTEGER NOT NULL DEFAULT 0,
    "archiveUncompressedBytes" BIGINT,
    "omsiFolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanNotes" JSONB,
    "patchForFileId" TEXT,
    "mirrorUrl" TEXT,
    "mirrorLabel" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploaderId" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModDependency" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "kind" "DependencyKind" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "steamDlcId" TEXT,
    "targetModId" TEXT,
    "externalUrl" TEXT,
    "externalLabel" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaImage" (
    "id" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "modId" TEXT,
    "devlogId" TEXT,
    "storageKey" TEXT NOT NULL,
    "fullKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedRelease" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "mode" "ReleaseMode" NOT NULL,
    "releaseAt" TIMESTAMP(3),
    "windowYear" INTEGER,
    "windowPart" "ReleaseWindowPart",
    "noEtaQuestions" BOOLEAN NOT NULL DEFAULT false,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevProgress" (
    "id" TEXT NOT NULL,
    "plannedReleaseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devlog" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Devlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "userId" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("userId","modId")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "modId" TEXT,
    "devlogId" TEXT,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "versionId" TEXT,
    "reporterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "logfile" TEXT,
    "omsiVersion" TEXT,
    "status" "BugStatus" NOT NULL DEFAULT 'OPEN',
    "fixedInVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReportComment" (
    "id" TEXT NOT NULL,
    "bugReportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReportComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "modId" TEXT,
    "fileId" TEXT,
    "reviewId" TEXT,
    "commentId" TEXT,
    "targetUserId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "versionId" TEXT,
    "moderatorId" TEXT NOT NULL,
    "decision" "ModerationDecision" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "modId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "filename" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "chunkSize" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "receivedChunks" INTEGER NOT NULL DEFAULT 0,
    "receivedBytes" BIGINT NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADING',
    "sha256" CHAR(64),
    "errorCode" TEXT,
    "modId" TEXT,
    "resultFileId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadEvent" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ipHash" CHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_slug_key" ON "Subcategory"("categoryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleBrand_slug_key" ON "VehicleBrand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_slug_key" ON "Operator"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SteamDlc_slug_key" ON "SteamDlc"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SteamDlc_steamAppId_key" ON "SteamDlc"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "Mod_slug_key" ON "Mod"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Mod_currentVersionId_key" ON "Mod"("currentVersionId");

-- CreateIndex
CREATE INDEX "Mod_status_publishedAt_idx" ON "Mod"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Mod_status_lastUpdatedAt_idx" ON "Mod"("status", "lastUpdatedAt" DESC);

-- CreateIndex
CREATE INDEX "Mod_status_downloadCount_idx" ON "Mod"("status", "downloadCount" DESC);

-- CreateIndex
CREATE INDEX "Mod_categoryId_status_idx" ON "Mod"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Mod_authorId_idx" ON "Mod"("authorId");

-- CreateIndex
CREATE INDEX "Mod_isFeatured_status_idx" ON "Mod"("isFeatured", "status");

-- CreateIndex
CREATE INDEX "Mod_searchText_idx" ON "Mod" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ModBrand_brandId_idx" ON "ModBrand"("brandId");

-- CreateIndex
CREATE INDEX "ModOperator_operatorId_idx" ON "ModOperator"("operatorId");

-- CreateIndex
CREATE INDEX "ModCredit_modId_idx" ON "ModCredit"("modId");

-- CreateIndex
CREATE INDEX "ModVersion_status_scheduledAt_idx" ON "ModVersion"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModVersion_modId_version_key" ON "ModVersion"("modId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ModFile_storageKey_key" ON "ModFile"("storageKey");

-- CreateIndex
CREATE INDEX "ModFile_modId_kind_idx" ON "ModFile"("modId", "kind");

-- CreateIndex
CREATE INDEX "ModFile_versionId_idx" ON "ModFile"("versionId");

-- CreateIndex
CREATE INDEX "ModFile_scanStatus_idx" ON "ModFile"("scanStatus");

-- CreateIndex
CREATE INDEX "ModFile_sha256_idx" ON "ModFile"("sha256");

-- CreateIndex
CREATE INDEX "ModDependency_modId_idx" ON "ModDependency"("modId");

-- CreateIndex
CREATE INDEX "ModDependency_targetModId_idx" ON "ModDependency"("targetModId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaImage_storageKey_key" ON "MediaImage"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaImage_fullKey_key" ON "MediaImage"("fullKey");

-- CreateIndex
CREATE INDEX "MediaImage_modId_sortOrder_idx" ON "MediaImage"("modId", "sortOrder");

-- CreateIndex
CREATE INDEX "MediaImage_devlogId_idx" ON "MediaImage"("devlogId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedRelease_modId_key" ON "PlannedRelease"("modId");

-- CreateIndex
CREATE INDEX "PlannedRelease_mode_releaseAt_idx" ON "PlannedRelease"("mode", "releaseAt");

-- CreateIndex
CREATE INDEX "DevProgress_plannedReleaseId_idx" ON "DevProgress"("plannedReleaseId");

-- CreateIndex
CREATE INDEX "Devlog_modId_createdAt_idx" ON "Devlog"("modId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Follow_modId_idx" ON "Follow"("modId");

-- CreateIndex
CREATE INDEX "Review_modId_createdAt_idx" ON "Review"("modId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Review_modId_userId_key" ON "Review"("modId", "userId");

-- CreateIndex
CREATE INDEX "Comment_modId_createdAt_idx" ON "Comment"("modId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_devlogId_createdAt_idx" ON "Comment"("devlogId", "createdAt");

-- CreateIndex
CREATE INDEX "BugReport_modId_status_idx" ON "BugReport"("modId", "status");

-- CreateIndex
CREATE INDEX "BugReportComment_bugReportId_createdAt_idx" ON "BugReportComment"("bugReportId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_modId_createdAt_idx" ON "ModerationAction"("modId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_emailedAt_idx" ON "Notification"("emailedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_resultFileId_key" ON "UploadSession"("resultFileId");

-- CreateIndex
CREATE INDEX "UploadSession_status_expiresAt_idx" ON "UploadSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "UploadSession_userId_status_idx" ON "UploadSession"("userId", "status");

-- CreateIndex
CREATE INDEX "DownloadEvent_modId_createdAt_idx" ON "DownloadEvent"("modId", "createdAt");

-- CreateIndex
CREATE INDEX "DownloadEvent_createdAt_idx" ON "DownloadEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mod" ADD CONSTRAINT "Mod_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mod" ADD CONSTRAINT "Mod_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mod" ADD CONSTRAINT "Mod_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mod" ADD CONSTRAINT "Mod_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ModVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModBrand" ADD CONSTRAINT "ModBrand_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModBrand" ADD CONSTRAINT "ModBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VehicleBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModOperator" ADD CONSTRAINT "ModOperator_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModOperator" ADD CONSTRAINT "ModOperator_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModCredit" ADD CONSTRAINT "ModCredit_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModCredit" ADD CONSTRAINT "ModCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModVersion" ADD CONSTRAINT "ModVersion_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_patchForFileId_fkey" FOREIGN KEY ("patchForFileId") REFERENCES "ModFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModDependency" ADD CONSTRAINT "ModDependency_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModDependency" ADD CONSTRAINT "ModDependency_steamDlcId_fkey" FOREIGN KEY ("steamDlcId") REFERENCES "SteamDlc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModDependency" ADD CONSTRAINT "ModDependency_targetModId_fkey" FOREIGN KEY ("targetModId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImage" ADD CONSTRAINT "MediaImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImage" ADD CONSTRAINT "MediaImage_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImage" ADD CONSTRAINT "MediaImage_devlogId_fkey" FOREIGN KEY ("devlogId") REFERENCES "Devlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedRelease" ADD CONSTRAINT "PlannedRelease_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevProgress" ADD CONSTRAINT "DevProgress_plannedReleaseId_fkey" FOREIGN KEY ("plannedReleaseId") REFERENCES "PlannedRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devlog" ADD CONSTRAINT "Devlog_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devlog" ADD CONSTRAINT "Devlog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_devlogId_fkey" FOREIGN KEY ("devlogId") REFERENCES "Devlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportComment" ADD CONSTRAINT "BugReportComment_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportComment" ADD CONSTRAINT "BugReportComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ModFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_resultFileId_fkey" FOREIGN KEY ("resultFileId") REFERENCES "ModFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ModFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 3) Trigger udržiava normalizovaný vyhľadávací text pre každý mod
CREATE OR REPLACE FUNCTION mod_search_text_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchText" := omsi_normalize(
    concat_ws(' ',
      NEW."title",
      NEW."summary",
      NEW."vehicleModel",
      array_to_string(NEW."tags", ' '),
      NEW."searchExtra"
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER "mod_search_text_trg"
BEFORE INSERT OR UPDATE OF "title", "summary", "vehicleModel", "tags", "searchExtra"
ON "Mod"
FOR EACH ROW
EXECUTE FUNCTION mod_search_text_update();

-- 4) Ochrana integrity na úrovni DB
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "DevProgress" ADD CONSTRAINT "DevProgress_percent_range" CHECK ("percent" BETWEEN 0 AND 100);
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_size_positive" CHECK ("sizeBytes" > 0);
ALTER TABLE "ModFile" ADD CONSTRAINT "ModFile_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ModDependency" ADD CONSTRAINT "ModDependency_target_present" CHECK (
  ("kind" = 'STEAM_DLC' AND "steamDlcId" IS NOT NULL) OR
  ("kind" = 'INTERNAL_MOD' AND "targetModId" IS NOT NULL) OR
  ("kind" = 'EXTERNAL_LINK' AND "externalUrl" IS NOT NULL)
);
ALTER TABLE "PlannedRelease" ADD CONSTRAINT "PlannedRelease_mode_fields" CHECK (
  ("mode" = 'EXACT_DATE' AND "releaseAt" IS NOT NULL) OR
  ("mode" = 'WINDOW' AND "windowYear" IS NOT NULL AND "windowPart" IS NOT NULL) OR
  ("mode" = 'TBA')
);
