#!/usr/bin/env bash
set -euo pipefail
# One supported deployment path serves the frontend and API together.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
exec ./deploy.sh "$@"
