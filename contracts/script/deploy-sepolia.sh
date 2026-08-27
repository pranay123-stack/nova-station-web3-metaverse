#!/usr/bin/env bash
# Deploys the contract set to Sepolia and verifies it on Etherscan.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SEPOLIA_RPC_URL:?set SEPOLIA_RPC_URL}"
: "${PRIVATE_KEY:?set PRIVATE_KEY (a funded Sepolia deployer key)}"

VERIFY_ARGS=()
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then
  VERIFY_ARGS=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")
else
  echo "ETHERSCAN_API_KEY not set — deploying without source verification." >&2
fi

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  --slow \
  "${VERIFY_ARGS[@]}" \
  -vvv

echo
echo "Deployment written to contracts/deployments/11155111.json"
echo "Copy the addresses into your .env as NEXT_PUBLIC_* and server CONTRACT_* values."
