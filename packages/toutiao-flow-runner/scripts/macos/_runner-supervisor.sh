#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="$RUNNER_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
LOG_FILE="${RUNNER_LOG_FILE:-$LOG_DIR/runner-$(date +%Y-%m-%d-%H-%M).log}"
PID_FILE="$RUN_DIR/runner.pid"
CHILD_PID_FILE="$RUN_DIR/runner-child.pid"
STOP_FILE="$RUN_DIR/stop"
ENTRY="$RUNNER_DIR/dist/index.js"

mkdir -p "$RUN_DIR" "$LOG_DIR"
echo "$$" > "$PID_FILE"
rm -f "$CHILD_PID_FILE" "$STOP_FILE"

CAFFEINATE_PID=""
NODE_PID=""

cleanup() {
  if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
    kill -TERM "$NODE_PID" 2>/dev/null || true
  fi
  if [ -n "$CAFFEINATE_PID" ] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
    kill -TERM "$CAFFEINATE_PID" 2>/dev/null || true
  fi
  # 保留 stop 文件，防止 TERM 清理后主循环误判并自动重启；下次 start 会清除
  rm -f "$PID_FILE" "$CHILD_PID_FILE"
}

trap cleanup EXIT INT TERM

# 保持系统不因空闲而睡眠；合盖睡眠仍需 clamshell 或 pmset。
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -w "$$" &
  CAFFEINATE_PID=$!
fi

while [ ! -f "$STOP_FILE" ]; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting runner" >> "$LOG_FILE"

  node "$ENTRY" >> "$LOG_FILE" 2>&1 &
  NODE_PID=$!
  echo "$NODE_PID" > "$CHILD_PID_FILE"

  wait "$NODE_PID"
  CODE=$?
  rm -f "$CHILD_PID_FILE"
  NODE_PID=""

  if [ -f "$STOP_FILE" ]; then
    break
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] runner exited ($CODE), restart in 5s" >> "$LOG_FILE"
  sleep 5
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] supervisor stopped" >> "$LOG_FILE"
