-- 非即梦引擎的额度限制记录
CREATE TABLE "EngineLimit" (
  "engine" TEXT NOT NULL PRIMARY KEY,
  "reason" TEXT,
  "limitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "until" DATETIME,
  "metadata" JSON,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "EngineLimit_until_idx" ON "EngineLimit"("until");

-- 迁移千问旧的 AppState 状态
INSERT OR IGNORE INTO "EngineLimit"
  ("engine", "reason", "until", "metadata", "updatedAt")
SELECT
  'qianwen',
  'professional-membership',
  json_extract("value", '$.until'),
  "value",
  CURRENT_TIMESTAMP
FROM "AppState"
WHERE "key" = 'qianwen-credit-limit'
  AND "value" IS NOT NULL
  AND json_valid("value")
  AND json_extract("value", '$.until') IS NOT NULL;

DELETE FROM "AppState" WHERE "key" = 'qianwen-credit-limit';
