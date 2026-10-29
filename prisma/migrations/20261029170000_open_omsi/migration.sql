-- CreateEnum
CREATE TYPE "OpenOmsiSupport" AS ENUM ('UNTESTED', 'WORKS', 'PARTIAL', 'NOT_WORKING', 'EXCLUSIVE');

-- AlterTable
ALTER TABLE "Mod" ADD COLUMN     "openOmsi" "OpenOmsiSupport" NOT NULL DEFAULT 'UNTESTED';

