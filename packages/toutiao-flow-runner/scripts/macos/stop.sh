#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="$RUNNER_DIR/.run"
PID_FILE="$RUN_DIR/runner.pid"
CHILD_PID_FILE="$RUN_DIR/runner-child.pid"
STOP_FILE="$RUN_DIR/stop"
ENTRY="$RUNNER_DIR/dist/index.js"
SUPERVISOR="$SCRIPT_DIR/_runner-supervisor.sh"

mkdir -p "$RUN_DIR"
touch "$STOP_FILE"

kill_tree() {
  local pid="${1:-}"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return
  fi

  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done

  kill -TERM "$pid" 2>/dev/null || true
}

if [ -f "$CHILD_PID_FILE" ]; then
  kill_tree "$(cat "$CHILD_PID_FILE")"
fi

if [ -f "$PID_FILE" ]; then
  kill_tree "$(cat "$PID_FILE")"
fi

# PID 文件可能因 supervisor 重启/异常退出而丢失，兜底清理所有 runner 进程
kill_matching() {
  local pattern="$1"
  local pid
  for pid in $(pgrep -f "$pattern" 2>/dev/null || true); do
    kill_tree "$pid"
  done
}

kill_matching "$ENTRY"
kill_matching "$SUPERVISOR"

sleep 2

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "进程未退出，强制结束..."
  kill -KILL "$(cat "$PID_FILE")" 2>/dev/null || true
fi

for pid in $(pgrep -f "$ENTRY" 2>/dev/null || true) $(pgrep -f "$SUPERVISOR" 2>/dev/null || true); do
  kill -KILL "$pid" 2>/dev/null || true
done

# 保留 stop 文件；下次 start 会清除，避免 supervisor 在退出前又重启
rm -f "$PID_FILE" "$CHILD_PID_FILE"
echo "项目已停止"
