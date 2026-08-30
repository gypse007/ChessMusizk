#!/usr/bin/env bash
set -euo pipefail

# ACE-Step API server wrapper with VAE crash fix
# Disables MLX-VAE (segfaults on >15s audio on macOS) and uses PyTorch VAE with small CPU chunks.
# Eager model init prevents the orphan-race where the server accepts tasks before loading.

export ACESTEP_DEVICE=cpu
export ACESTEP_VAE_ON_CPU=1
export ACESTEP_VAE_DECODE_CHUNK_SIZE=16
export ACESTEP_INIT_LLM=false
export ACESTEP_NO_INIT=false
export PYTHONFAULTHANDLER=1

# Server only needs ACE-Step on its path. sitecustomize.py, if present in ACE-Step-1.5,
# provides the MLX-VAE safety net for MPS; env vars are the primary CPU fix.
export PYTHONPATH="${HOME}/dev/ACE-Step-1.5"

cd "$HOME/dev/ACE-Step-1.5"
exec ./start_api_server_macos.sh "$@"
