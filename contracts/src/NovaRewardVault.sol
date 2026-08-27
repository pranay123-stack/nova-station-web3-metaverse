// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {NovaRoles} from "./NovaRoles.sol";

/// @title NovaRewardVault
/// @notice Holds tournament and event rewards, released against vouchers the
///         game server signs off-chain.
/// @dev The game decides *who* earned a reward — that is inherently off-chain
///      knowledge. The vault's job is to make redemption trustless once the
///      server has decided: a voucher is an EIP-712 typed signature bound to a
///      recipient, a nonce, a deadline, this contract's address and this chain
///      id. It cannot be replayed on another chain, against another deployment,
///      by another address, or twice.
///
///      Note the asymmetry that follows: a player never has to trust the server
///      to *deliver* a reward, only to *grant* it. Once signed, the voucher is
///      redeemable by the recipient alone, whatever the server does next.
contract NovaRewardVault is AccessControl, Pausable, ReentrancyGuard, EIP712, ERC721Holder, ERC1155Holder {
    enum RewardKind {
        ETH,
        ERC721,
        ERC1155
    }

    struct Voucher {
        address to;
        uint256 nonce;
        RewardKind kind;
        /// @dev Ignored for ETH rewards.
        address collection;
        /// @dev Ignored for ETH rewards.
        uint256 tokenId;
        /// @dev Wei for ETH, token count for ERC-1155, must be 1 for ERC-721.
        uint256 amount;
        uint256 deadline;
    }

    bytes32 private constant VOUCHER_TYPEHASH = keccak256(
        "Voucher(address to,uint256 nonce,uint8 kind,address collection,uint256 tokenId,uint256 amount,uint256 deadline)"
    );

    mapping(address account => mapping(uint256 nonce => bool)) public nonceUsed;

    error ZeroAddress();
    error ZeroAmount();
    error VoucherExpired(uint256 deadline, uint256 nowTs);
    error NonceAlreadyUsed(address to, uint256 nonce);
    error InvalidSigner(address recovered);
    error NotRecipient(address expected, address caller);
    error AmountMustBeOneForERC721();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    event Funded(address indexed from, uint256 amount);
    event Redeemed(
        address indexed to,
        uint256 indexed nonce,
        RewardKind kind,
        address collection,
        uint256 tokenId,
        uint256 amount
    );
    event Swept(address indexed to, uint256 amount);

    constructor(address admin, address signer) EIP712("NovaRewardVault", "1") {
        if (admin == address(0) || signer == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(NovaRoles.SIGNER_ROLE, signer);
        _grantRole(NovaRoles.PAUSER_ROLE, admin);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Adds ETH to the reward pool.
    function fund() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Redeems a signed reward voucher.
    /// @dev Only the named recipient may redeem, so a voucher intercepted in
    ///      transit is worthless to anyone else.
    function redeem(Voucher calldata voucher, bytes calldata signature) external nonReentrant whenNotPaused {
        if (voucher.to != msg.sender) revert NotRecipient(voucher.to, msg.sender);
        if (block.timestamp > voucher.deadline) revert VoucherExpired(voucher.deadline, block.timestamp);
        if (nonceUsed[voucher.to][voucher.nonce]) revert NonceAlreadyUsed(voucher.to, voucher.nonce);
        if (voucher.amount == 0) revert ZeroAmount();
        if (voucher.kind == RewardKind.ERC721 && voucher.amount != 1) revert AmountMustBeOneForERC721();

        address signer = ECDSA.recover(_hash(voucher), signature);
        if (!hasRole(NovaRoles.SIGNER_ROLE, signer)) revert InvalidSigner(signer);

        // Effects before interactions: the nonce is burned first, so even a
        // reentrant token callback cannot redeem the same voucher twice.
        nonceUsed[voucher.to][voucher.nonce] = true;

        emit Redeemed(
            voucher.to, voucher.nonce, voucher.kind, voucher.collection, voucher.tokenId, voucher.amount
        );

        if (voucher.kind == RewardKind.ETH) {
            if (address(this).balance < voucher.amount) {
                revert InsufficientBalance(voucher.amount, address(this).balance);
            }
            (bool ok,) = payable(voucher.to).call{value: voucher.amount}("");
            if (!ok) revert TransferFailed();
        } else if (voucher.kind == RewardKind.ERC721) {
            IERC721(voucher.collection).safeTransferFrom(address(this), voucher.to, voucher.tokenId);
        } else {
            IERC1155(voucher.collection)
                .safeTransferFrom(address(this), voucher.to, voucher.tokenId, voucher.amount, "");
        }
    }

    /// @notice Invalidates a voucher before it is redeemed.
    /// @dev The escape hatch for a signing key that has to be rotated: a
    ///      compromised key's outstanding vouchers can be burned one by one
    ///      without pausing redemption for everyone else.
    function invalidateNonce(address account, uint256 nonce) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nonceUsed[account][nonce] = true;
    }

    /// @notice Recovers unclaimed ETH.
    function sweep(address payable to, uint256 amount) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (address(this).balance < amount) revert InsufficientBalance(amount, address(this).balance);
        emit Swept(to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Recovers unclaimed assets.
    function sweepAsset(RewardKind kind, address collection, address to, uint256 tokenId, uint256 amount)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (to == address(0)) revert ZeroAddress();
        if (kind == RewardKind.ERC721) {
            IERC721(collection).safeTransferFrom(address(this), to, tokenId);
        } else if (kind == RewardKind.ERC1155) {
            IERC1155(collection).safeTransferFrom(address(this), to, tokenId, amount, "");
        } else {
            revert ZeroAmount();
        }
    }

    function pause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _unpause();
    }

    /// @notice The EIP-712 digest a voucher must be signed over.
    function hashVoucher(Voucher calldata voucher) external view returns (bytes32) {
        return _hash(voucher);
    }

    /// @notice Domain separator, exposed so clients can verify what they sign.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _hash(Voucher calldata voucher) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VOUCHER_TYPEHASH,
                    voucher.to,
                    voucher.nonce,
                    uint8(voucher.kind),
                    voucher.collection,
                    voucher.tokenId,
                    voucher.amount,
                    voucher.deadline
                )
            )
        );
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
