-- 找不到引擎时的锁定状态
ALTER TABLE "Book" ADD COLUMN "noEngineLockedAt" DATETIME;
ALTER TABLE "Book" ADD COLUMN "noEngineLockCount" INTEGER NOT NULL DEFAULT 0;
