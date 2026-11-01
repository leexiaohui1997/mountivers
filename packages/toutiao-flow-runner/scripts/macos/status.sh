#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="$RUNNER_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
PID_FILE="$RUN_DIR/runner.pid"
CHILD_PID_FILE="$RUN_DIR/runner-child.pid"
LOG_FILE=""

LOG_FILE=$(ls -t "$LOG_DIR"/runner-*.log 2>/dev/null | head -1)
[ -z "$LOG_FILE" ] && LOG_FILE="$LOG_DIR/runner-$(date +%Y-%m-%d-%H-%M).log"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "状态: 运行中"
  echo "supervisor pid: $(cat "$PID_FILE")"
  if [ -f "$CHILD_PID_FILE" ]; then
    echo "runner pid: $(cat "$CHILD_PID_FILE")"
  fi
  echo "日志: $LOG_FILE"
  echo "--- 最近日志 ---"
  if [ -f "$LOG_FILE" ]; then
    tail -n 20 "$LOG_FILE"
  else
    echo "暂无日志"
  fi
else
  echo "状态: 已停止"
fi
