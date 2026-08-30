#!/usr/bin/env bash
set -euo pipefail

# ACE-Step API server wrapper with VAE crash fix
# Disables MLX-VAE (segfaults on >15s audio on macOS) and uses PyTorch VAE with small CPU chunks.
# Eager model init prevents the orphan-race where the server accepts tasks before loading.
# Preflight refuses to launch into an OOM SIGKILL by checking free+purgeable memory.

LOG="/tmp/c2m-acestep.log"
ACESTEP_DIR="${HOME}/dev/ACE-Step-1.5"

# --- preflight: refuse to launch into an OOM SIGKILL ---
PAGE=$(getconf PAGESIZE)
FREE=$(vm_stat | awk -v p="$PAGE" '
  /Pages free/      {gsub("\\.","",$3); f=$3}
  /Pages purgeable/ {gsub("\\.","",$3); g=$3}
  END {printf "%.2f", (f+g)*p/1073741824}')
MIN_GB=6
echo "[preflight] $(date '+%F %T') free+purgeable=${FREE}GB (min=${MIN_GB}GB)" >> "$LOG"
if awk "BEGIN{exit !($FREE < $MIN_GB)}"; then
  echo "[preflight] REFUSING: ${FREE}GB < ${MIN_GB}GB — model load WILL swap-thrash and get SIGKILLed" >> "$LOG"
  exit 75
fi

export ACESTEP_DEVICE=cpu
export ACESTEP_VAE_ON_CPU=1
export ACESTEP_VAE_DECODE_CHUNK_SIZE=16
export ACESTEP_INIT_LLM=false
export ACESTEP_NO_INIT=false
export PYTHONFAULTHANDLER=1

# Server only needs ACE-Step on its path. sitecustomize.py, if present in ACE-Step-1.5,
# provides the MLX-VAE safety net for MPS; env vars are the primary CPU fix.
export PYTHONPATH="${ACESTEP_DIR}"

cd "$ACESTEP_DIR"
"${ACESTEP_DIR}/.venv/bin/python" -u -m acestep.api_server --host 127.0.0.1 --port 8001 >> "$LOG" 2>&1
EC=$?
echo "SERVER_EXITED code=$EC at $(date '+%F %T')" >> "$LOG"
exit $EC
