#!/usr/bin/env bash
# Deploys the contract set to a local anvil node.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
# anvil's first well-known account. Never use this key anywhere real.
export PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

if ! cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  echo "No node at $RPC_URL. Start one with: pnpm chain:node" >&2
  exit 1
fi

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast -vvv
echo
echo "Deployment written to contracts/deployments/31337.json"
