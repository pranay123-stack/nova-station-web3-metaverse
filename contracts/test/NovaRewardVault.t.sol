// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {NovaAssets} from "../src/NovaAssets.sol";
import {NovaItems} from "../src/NovaItems.sol";
import {NovaRewardVault} from "../src/NovaRewardVault.sol";
import {NovaRoles} from "../src/NovaRoles.sol";

contract NovaRewardVaultTest is Test {
    NovaRewardVault internal vault;
    NovaAssets internal assets;
    NovaItems internal items;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal attacker = makeAddr("attacker");

    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    uint256 internal rogueKey = 0xBAD;
    address internal rogue;

    uint256 internal constant ITEM_ID = 1;

    function setUp() public {
        signer = vm.addr(signerKey);
        rogue = vm.addr(rogueKey);

        vm.startPrank(admin);
        vault = new NovaRewardVault(admin, signer);
        assets = new NovaAssets(admin, "");
        items = new NovaItems(admin, "");
        items.registerItem(ITEM_ID, bytes32("cosmetic"), bytes32("trail_nova"), 4, 0);
        items.mint(address(vault), ITEM_ID, 50);
        assets.mint(address(vault), bytes32("ship"), bytes32("aurora"), 4, 1, "");
        vm.stopPrank();

        vm.deal(address(this), 100 ether);
        vault.fund{value: 20 ether}();
    }

    function _voucher(NovaRewardVault.RewardKind kind, address to, uint256 nonce, uint256 amount)
        internal
        view
        returns (NovaRewardVault.Voucher memory)
    {
        address collection = kind == NovaRewardVault.RewardKind.ERC721
            ? address(assets)
            : kind == NovaRewardVault.RewardKind.ERC1155 ? address(items) : address(0);
        uint256 tokenId = kind == NovaRewardVault.RewardKind.ERC721
            ? 1
            : kind == NovaRewardVault.RewardKind.ERC1155 ? ITEM_ID : 0;
        return NovaRewardVault.Voucher({
            to: to,
            nonce: nonce,
            kind: kind,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            deadline: block.timestamp + 1 hours
        });
    }

    function _sign(NovaRewardVault.Voucher memory voucher, uint256 key) internal view returns (bytes memory) {
        bytes32 digest = vault.hashVoucher(voucher);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /* --------------------------------------------------------- redeem */

    function test_RedeemsEthAgainstAValidVoucher() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 3 ether);
        bytes memory signature = _sign(voucher, signerKey);

        vm.prank(alice);
        vault.redeem(voucher, signature);

        assertEq(alice.balance, 3 ether);
        assertTrue(vault.nonceUsed(alice, 1));
    }

    function test_RedeemsErc721() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ERC721, alice, 2, 1);
        bytes memory signature = _sign(voucher, signerKey);
        vm.prank(alice);
        vault.redeem(voucher, signature);
        assertEq(assets.ownerOf(1), alice);
    }

    function test_RedeemsErc1155() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ERC1155, alice, 3, 5);
        bytes memory signature = _sign(voucher, signerKey);
        vm.prank(alice);
        vault.redeem(voucher, signature);
        assertEq(items.balanceOf(alice, ITEM_ID), 5);
        assertEq(items.balanceOf(address(vault), ITEM_ID), 45);
    }

    function test_EmitsRedeemedEvent() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 7, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);
        vm.expectEmit(true, true, false, true);
        emit NovaRewardVault.Redeemed(alice, 7, NovaRewardVault.RewardKind.ETH, address(0), 0, 1 ether);
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    /* ------------------------------------------------------ replay/forgery */

    function test_RevertWhen_ReplayingTheSameVoucher() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);

        vm.startPrank(alice);
        vault.redeem(voucher, signature);
        vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.NonceAlreadyUsed.selector, alice, 1));
        vault.redeem(voucher, signature);
        vm.stopPrank();
    }

    function test_RevertWhen_SignedByAnUnauthorisedKey() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, rogueKey);
        vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.InvalidSigner.selector, rogue));
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_RevertWhen_SomeoneElseRedeemsYourVoucher() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);
        vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.NotRecipient.selector, alice, attacker));
        vm.prank(attacker);
        vault.redeem(voucher, signature);
    }

    function test_RevertWhen_TamperingWithTheAmount() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);
        voucher.amount = 15 ether;

        vm.expectRevert();
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_RevertWhen_TamperingWithTheRecipient() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);
        voucher.to = attacker;

        vm.expectRevert();
        vm.prank(attacker);
        vault.redeem(voucher, signature);
    }

    function test_RevertWhen_VoucherHasExpired() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);
        vm.warp(voucher.deadline + 1);

        vm.expectRevert(
            abi.encodeWithSelector(NovaRewardVault.VoucherExpired.selector, voucher.deadline, block.timestamp)
        );
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_VoucherIsBoundToThisDeploymentAndChain() public {
        // A voucher signed for this vault must not redeem at an identical
        // second deployment: the EIP-712 domain includes the contract address.
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);

        vm.prank(admin);
        NovaRewardVault other = new NovaRewardVault(admin, signer);
        vm.deal(address(other), 10 ether);

        assertNotEq(vault.domainSeparator(), other.domainSeparator());
        vm.expectRevert();
        vm.prank(alice);
        other.redeem(voucher, signature);
    }

    function test_RevertWhen_SignatureIsGarbage() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        vm.expectRevert();
        vm.prank(alice);
        vault.redeem(voucher, hex"deadbeef");
    }

    /* -------------------------------------------------------- validation */

    function test_RevertWhen_AmountIsZero() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 0);
        bytes memory signature = _sign(voucher, signerKey);
        vm.expectRevert(NovaRewardVault.ZeroAmount.selector);
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_RevertWhen_Erc721AmountIsNotOne() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ERC721, alice, 1, 2);
        bytes memory signature = _sign(voucher, signerKey);
        vm.expectRevert(NovaRewardVault.AmountMustBeOneForERC721.selector);
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_RevertWhen_VaultCannotCoverAnEthVoucher() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 100 ether);
        bytes memory signature = _sign(voucher, signerKey);
        vm.expectRevert(
            abi.encodeWithSelector(NovaRewardVault.InsufficientBalance.selector, 100 ether, 20 ether)
        );
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    /* -------------------------------------------------------------- admin */

    function test_AdminCanBurnAnOutstandingNonce() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 9, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);

        vm.prank(admin);
        vault.invalidateNonce(alice, 9);

        vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.NonceAlreadyUsed.selector, alice, 9));
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_RotatingTheSignerInvalidatesOldVouchers() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);

        vm.prank(admin);
        vault.revokeRole(NovaRoles.SIGNER_ROLE, signer);

        vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.InvalidSigner.selector, signer));
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_PauseStopsRedemption() public {
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);
        vm.prank(admin);
        vault.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        vault.redeem(voucher, signature);
    }

    function test_AdminSweepsUnclaimedEthAndAssets() public {
        vm.startPrank(admin);
        vault.sweep(payable(admin), 5 ether);
        vault.sweepAsset(NovaRewardVault.RewardKind.ERC721, address(assets), admin, 1, 1);
        vm.stopPrank();
        assertEq(admin.balance, 5 ether);
        assertEq(assets.ownerOf(1), admin);
    }

    function test_RevertWhen_AttackerSweeps() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, bytes32(0)
            )
        );
        vm.prank(attacker);
        vault.sweep(payable(attacker), 1 ether);
    }

    function test_RevertWhen_AttackerInvalidatesNonces() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, bytes32(0)
            )
        );
        vm.prank(attacker);
        vault.invalidateNonce(alice, 1);
    }

    function test_AcceptsDirectFunding() public {
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(vault).balance, 21 ether);
    }

    /* ---------------------------------------------------------------- fuzz */

    function testFuzz_OnlyTheNamedRecipientCanEverRedeem(address caller, uint96 amount) public {
        vm.assume(caller != address(0) && caller != alice);
        amount = uint96(bound(amount, 1, 10 ether));
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 1, amount);
        bytes memory signature = _sign(voucher, signerKey);

        vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.NotRecipient.selector, alice, caller));
        vm.prank(caller);
        vault.redeem(voucher, signature);
    }

    function testFuzz_EachNonceRedeemsAtMostOnce(uint8 attempts) public {
        attempts = uint8(bound(attempts, 2, 10));
        NovaRewardVault.Voucher memory voucher = _voucher(NovaRewardVault.RewardKind.ETH, alice, 5, 1 ether);
        bytes memory signature = _sign(voucher, signerKey);

        vm.startPrank(alice);
        vault.redeem(voucher, signature);
        for (uint256 i = 1; i < attempts; ++i) {
            vm.expectRevert(abi.encodeWithSelector(NovaRewardVault.NonceAlreadyUsed.selector, alice, 5));
            vault.redeem(voucher, signature);
        }
        vm.stopPrank();
        assertEq(alice.balance, 1 ether);
    }
}
