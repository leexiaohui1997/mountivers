#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="$RUNNER_DIR/.run"
PID_FILE="$RUN_DIR/runner.pid"
CHILD_PID_FILE="$RUN_DIR/runner-child.pid"
STOP_FILE="$RUN_DIR/stop"

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

sleep 2

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "进程未退出，强制结束..."
  kill -KILL "$(cat "$PID_FILE")" 2>/dev/null || true
fi

# 保留 stop 文件；下次 start 会清除，避免 supervisor 在退出前又重启
rm -f "$PID_FILE" "$CHILD_PID_FILE"
echo "项目已停止"
