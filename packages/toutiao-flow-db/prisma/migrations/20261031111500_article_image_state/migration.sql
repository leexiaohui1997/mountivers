-- AlterTable
ALTER TABLE "Article" ADD COLUMN "imageAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Article" ADD COLUMN "imageLastError" TEXT;
