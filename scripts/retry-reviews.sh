#!/bin/bash
# Auto-retry the IMC review and revision workflow with rate limit handling.
# Safe to leave running overnight — each phase retries and later phases only
# start after earlier phases completed successfully.
#
# Usage: bash scripts/retry-reviews.sh

set -euo pipefail

# On macOS, keep the machine awake for the full overnight workflow unless
# the caller explicitly disables it. The wrapper exits when this script exits,
# so normal sleep behavior resumes automatically afterward.
if [ "${CLAUDEFLOW_SKIP_CAFFEINATE:-0}" != "1" ] \
  && [ "${CLAUDEFLOW_CAFFEINATED:-0}" != "1" ] \
  && command -v caffeinate >/dev/null 2>&1; then
  export CLAUDEFLOW_CAFFEINATED=1
  exec caffeinate -i -s env CLAUDEFLOW_CAFFEINATED=1 bash "$0" "$@"
fi

CLAUDEFLOW="/Users/landigf/Desktop/Code/claudeflow"
TRACE_DIR="$CLAUDEFLOW/traces"
LOG="/tmp/retry-reviews.log"
TODAY="$(date +%Y-%m-%d)"
MAX_RETRIES=5

log() {
  echo "$(date): $*" | tee -a "$LOG"
}

latest_matching_file() {
  local pattern="$1"
  find "$TRACE_DIR" -maxdepth 1 -type f -name "$pattern" 2>/dev/null | sort | tail -n 1
}

trace_completed() {
  local trace_file="$1"
  [ -n "$trace_file" ] && [ -f "$trace_file" ] && grep -m1 '"status":' "$trace_file" | grep -q '"completed"'
}

phase_completed() {
  local prefix="$1"
  local trace_file
  trace_file="$(latest_matching_file "${prefix}-${TODAY}*.json")"
  trace_completed "$trace_file"
}

wait_before_retry() {
  if tail -40 "$LOG" 2>/dev/null | grep -Eqi "rate|limit|429|quota|capacity|max usage"; then
    log "Rate limited. Waiting 30 minutes before retry..."
    sleep 1800
  else
    log "Failed without a clear rate-limit signature. Waiting 60 seconds before retry..."
    sleep 60
  fi
}

run_command() {
  local name="$1"
  shift
  local retry=0
  local cmd=("$@")

  while [ "$retry" -lt "$MAX_RETRIES" ]; do
    log "Running $name (attempt $((retry + 1))/$MAX_RETRIES)"

    if (
      cd "$CLAUDEFLOW"
      "${cmd[@]}"
    ) >> "$LOG" 2>&1; then
      log "$name completed successfully."
      return 0
    fi

    retry=$((retry + 1))
    if [ "$retry" -lt "$MAX_RETRIES" ]; then
      wait_before_retry
    fi
  done

  log "$name failed after $MAX_RETRIES attempts."
  return 1
}

log "Starting retry-reviews script"

log ""
log "=== Phase 1: Missing Reviewers ==="
if phase_completed "imc-missing-reviewers"; then
  log "Missing reviewers already completed today. Skipping."
else
  run_command "IMC Chair + Methodology Expert" npx tsx examples/imc-missing-reviewers.ts
fi

log ""
log "=== Phase 2: Crew Round 2 ==="
if phase_completed "imc-crew-round2"; then
  log "Crew Round 2 already completed today. Skipping."
else
  run_command "Crew Round 2" npx tsx examples/run-crew-r2.ts
fi

log ""
log "=== Phase 3: Apply Overnight Review Feedback ==="
if phase_completed "imc-overnight-revision"; then
  log "Overnight revision already completed today. Skipping."
else
  run_command "Overnight paper revision" npx tsx examples/imc-overnight-revision.ts
fi

log ""
log "=== Phase 4: Post-Revision Validation Crew ==="
if phase_completed "imc-post-revision-crew"; then
  log "Post-revision crew already completed today. Skipping."
else
  run_command "Post-revision 8-expert crew" npx tsx examples/imc-post-revision-crew.ts
fi

log ""
log "All overnight phases complete."
log "Artifacts created today:"
find "$TRACE_DIR" -maxdepth 1 -type f \
  \( -name "imc-missing-reviewers-${TODAY}*" \
  -o -name "imc-crew-round2-${TODAY}*" \
  -o -name "imc-overnight-revision-${TODAY}*" \
  -o -name "imc-post-revision-crew-${TODAY}*" \) \
  | sort | tee -a "$LOG"
log "Full log: $LOG"
