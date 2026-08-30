#!/usr/bin/env bash
set -euo pipefail

# ACE-Step API server wrapper with VAE crash fix
# Disables MLX-VAE (segfaults on >15s audio on macOS) and uses PyTorch VAE with small CPU chunks.

export ACESTEP_VAE_ON_CPU=1
export ACESTEP_VAE_DECODE_CHUNK_SIZE=16

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXED_SCRIPT_DIR="$SCRIPT_DIR"

# Use sitecustomize to monkey-patch MLX-VAE before ACE-Step starts
export PYTHONPATH="${FIXED_SCRIPT_DIR}${PYTHONPATH:+:$PYTHONPATH}"

cd "$SCRIPT_DIR"
exec ./start_api_server_macos.sh "$@"
