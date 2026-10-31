-- AlterTable
ALTER TABLE "Book" ADD COLUMN "toutiaoCollectionCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Book" ADD COLUMN "toutiaoCollectionAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Book" ADD COLUMN "toutiaoCollectionLastError" TEXT;
