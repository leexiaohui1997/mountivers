#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="$RUNNER_DIR/.run"
PID_FILE="$RUN_DIR/runner.pid"
LOG_FILE="$RUN_DIR/runner.log"
ENTRY="$RUNNER_DIR/dist/index.js"
RUNNER_ENV="$RUNNER_DIR/.env"

if [ ! -f "$RUNNER_ENV" ]; then
  echo "缺少 runner 环境变量文件: $RUNNER_ENV" >&2
  exit 1
fi

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "项目已经在运行，pid=$(cat "$PID_FILE")"
  echo "查看状态: $SCRIPT_DIR/status.sh"
  exit 0
fi

mkdir -p "$RUN_DIR"
rm -f "$RUN_DIR/stop"

if command -v pnpm >/dev/null 2>&1; then
  PNPM="$(command -v pnpm)"
else
  echo "未找到 pnpm，请先安装或在 PATH 中配置" >&2
  exit 1
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "构建 runner..."
  (cd "$RUNNER_DIR" && "$PNPM" run build)
fi

if [ ! -f "$ENTRY" ]; then
  echo "runner 构建产物不存在: $ENTRY" >&2
  echo "请检查构建日志，或不要设置 SKIP_BUILD=1" >&2
  exit 1
fi

if [ -f "$LOG_FILE" ]; then
  SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 10485760 ]; then
    mv "$LOG_FILE" "$LOG_FILE.1"
  fi
fi

nohup bash "$SCRIPT_DIR/_runner-supervisor.sh" >> "$LOG_FILE" 2>&1 &
SUPERVISOR_PID=$!

sleep 1

if kill -0 "$SUPERVISOR_PID" 2>/dev/null; then
  echo "项目已启动，supervisor pid=$SUPERVISOR_PID"
  echo "日志: $LOG_FILE"
  echo "停止: $SCRIPT_DIR/stop.sh"
else
  echo "启动失败，请查看日志: $LOG_FILE" >&2
  exit 1
fi
