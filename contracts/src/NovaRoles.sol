// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title NovaRoles
/// @notice Role identifiers shared by every NOVA STATION contract.
/// @dev Keeping the constants in one library guarantees that a role granted on
///      one contract means the same thing on the next, and makes the privileged
///      surface of the whole system auditable from a single file.
library NovaRoles {
    /// @notice May mint new assets. Held by the game server's minter key.
    bytes32 internal constant MINTER_ROLE = keccak256("NOVA_MINTER_ROLE");

    /// @notice May pause and unpause a contract in an emergency.
    bytes32 internal constant PAUSER_ROLE = keccak256("NOVA_PAUSER_ROLE");

    /// @notice May register item definitions and set metadata URIs.
    bytes32 internal constant CURATOR_ROLE = keccak256("NOVA_CURATOR_ROLE");

    /// @notice May sign reward vouchers redeemable at the reward vault.
    bytes32 internal constant SIGNER_ROLE = keccak256("NOVA_SIGNER_ROLE");

    /// @notice May change marketplace fees and the collection allowlist.
    bytes32 internal constant MARKET_ADMIN_ROLE = keccak256("NOVA_MARKET_ADMIN_ROLE");
}
