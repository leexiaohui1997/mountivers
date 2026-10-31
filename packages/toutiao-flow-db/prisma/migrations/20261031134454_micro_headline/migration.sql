-- CreateTable
CREATE TABLE "MicroHeadline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "data" JSONB,
    "imagesDone" BOOLEAN NOT NULL DEFAULT false,
    "imageAttempts" INTEGER NOT NULL DEFAULT 0,
    "imageLastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MicroHeadline_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MicroHeadline_bookId_idx" ON "MicroHeadline"("bookId");

-- CreateIndex
CREATE INDEX "MicroHeadline_imagesDone_createdAt_idx" ON "MicroHeadline"("imagesDone", "createdAt");
