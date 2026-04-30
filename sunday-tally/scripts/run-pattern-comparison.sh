#!/bin/bash
# run-pattern-comparison.sh
#
# Orchestrates the Pattern Reader comparison:
#   1. Stop any existing dev server on port 3000
#   2. Start dev server with IMPORT_PATTERN_READER_MODEL=claude-opus-4-7
#   3. Run test fixtures, label as "opus"
#   4. Stop dev server
#   5. Start dev server with IMPORT_PATTERN_READER_MODEL=claude-sonnet-4-6
#   6. Run test fixtures, label as "sonnet"
#   7. Stop dev server
#
# Output: PATTERN_READER_COMPARISON_RESULTS.json with both runs merged.
set -uo pipefail

cd "$(dirname "$0")/.."
LOG_DIR="/tmp"

stop_existing_server() {
  echo "[orchestrator] Stopping any existing process on port 3000..."
  # Windows: use netstat + taskkill (Git Bash compatible)
  local pids
  pids=$(netstat -ano 2>/dev/null | grep ":3000 " | grep LISTENING | awk '{print $NF}' | sort -u || true)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      echo "[orchestrator]   killing PID $pid"
      taskkill //F //PID "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    done
    sleep 2
  fi
}

start_server_with_model() {
  local model=$1
  local logfile=$2
  echo "[orchestrator] Starting dev server with IMPORT_PATTERN_READER_MODEL=$model"
  IMPORT_PATTERN_READER_MODEL="$model" npm run dev > "$logfile" 2>&1 &
  local pid=$!
  echo "[orchestrator]   PID: $pid, logging to $logfile"

  # Wait up to 60s for server to be ready
  local waited=0
  until curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/auth/login 2>/dev/null | grep -q "200\|307"; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -gt 60 ]; then
      echo "[orchestrator] ERROR: server not ready after 60s; last log lines:"
      tail -20 "$logfile"
      return 1
    fi
  done
  echo "[orchestrator]   ready in ${waited}s"
  return 0
}

# ── Run A: Opus ──────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════"
echo " RUN A — Pattern Reader = claude-opus-4-7"
echo "═══════════════════════════════════════════"
stop_existing_server
start_server_with_model "claude-opus-4-7" "$LOG_DIR/dev_A_opus.log" || exit 1

echo "[orchestrator] Running 6 fixtures..."
node scripts/test-pattern-reader-comparison.mjs opus
RUN_A_EXIT=$?

stop_existing_server
sleep 3

# ── Run B: Sonnet ────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo " RUN B — Pattern Reader = claude-sonnet-4-6"
echo "═══════════════════════════════════════════"
start_server_with_model "claude-sonnet-4-6" "$LOG_DIR/dev_B_sonnet.log" || exit 1

echo "[orchestrator] Running 6 fixtures..."
node scripts/test-pattern-reader-comparison.mjs sonnet
RUN_B_EXIT=$?

stop_existing_server

echo ""
echo "═══════════════════════════════════════════"
echo " COMPLETE"
echo "═══════════════════════════════════════════"
echo " Run A exit: $RUN_A_EXIT"
echo " Run B exit: $RUN_B_EXIT"
echo " Results: PATTERN_READER_COMPARISON_RESULTS.json"
