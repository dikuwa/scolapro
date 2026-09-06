#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TRIGGER_SECRET_KEY="${TRIGGER_SECRET_KEY:-}"
exec npx trigger.dev@latest dev --config ./trigger.config.ts
