-- 每日发布成功统计
CREATE TABLE "PublishStat" (
  "date" TEXT NOT NULL PRIMARY KEY,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL
);
