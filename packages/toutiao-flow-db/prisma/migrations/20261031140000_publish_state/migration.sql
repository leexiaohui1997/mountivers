-- CreateTable
CREATE TABLE "AppState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT
);

-- Seed 默认发布限额状态
INSERT OR IGNORE INTO "AppState" ("key", "value") VALUES ('toutiao-publish-limit', NULL);

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "publishAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Article" ADD COLUMN "publishLastError" TEXT;
ALTER TABLE "Article" ADD COLUMN "publishedAt" DATETIME;
