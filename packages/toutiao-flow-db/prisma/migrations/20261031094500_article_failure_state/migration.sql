-- AlterTable
ALTER TABLE "Article" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Article" ADD COLUMN "lastError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Article_bookId_index_key" ON "Article"("bookId", "index");
