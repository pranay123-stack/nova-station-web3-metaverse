// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {NovaItems} from "../src/NovaItems.sol";
import {NovaRoles} from "../src/NovaRoles.sol";

contract NovaItemsTest is Test {
    NovaItems internal items;

    address internal admin = makeAddr("admin");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant LASER = 1;
    uint256 internal constant SHELL = 2;
    bytes32 internal constant MODULE = bytes32("module");

    function setUp() public {
        vm.startPrank(admin);
        items = new NovaItems(admin, "https://api.nova.example/item/");
        items.grantRole(NovaRoles.MINTER_ROLE, minter);
        items.registerItem(LASER, MODULE, bytes32("mining_laser_ii"), 2, 0);
        items.registerItem(SHELL, bytes32("equipment"), bytes32("suit_voidwalker"), 3, 100);
        vm.stopPrank();
    }

    /* -------------------------------------------------------- registry */

    function test_RegisteredItemCarriesItsMetadata() public view {
        NovaItems.ItemMeta memory meta = items.itemMeta(LASER);
        assertTrue(meta.registered);
        assertEq(meta.kind, MODULE);
        assertEq(meta.defId, bytes32("mining_laser_ii"));
        assertEq(meta.rarity, 2);
        assertEq(meta.maxSupply, 0);
    }

    function test_RevertWhen_MintingUnregisteredId() public {
        vm.expectRevert(abi.encodeWithSelector(NovaItems.NotRegistered.selector, 999));
        vm.prank(minter);
        items.mint(alice, 999, 1);
    }

    function test_RevertWhen_RegisteringTwice() public {
        vm.expectRevert(abi.encodeWithSelector(NovaItems.AlreadyRegistered.selector, LASER));
        vm.prank(admin);
        items.registerItem(LASER, MODULE, bytes32("x"), 0, 0);
    }

    function test_RevertWhen_NonCuratorRegisters() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, NovaRoles.CURATOR_ROLE
            )
        );
        vm.prank(attacker);
        items.registerItem(42, MODULE, bytes32("evil"), 0, 0);
    }

    function test_RevertWhen_RegisteringWithBadRarityOrKind() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(NovaItems.RarityOutOfRange.selector, uint8(9)));
        items.registerItem(50, MODULE, bytes32("x"), 9, 0);
        vm.expectRevert(NovaItems.EmptyKind.selector);
        items.registerItem(51, bytes32(0), bytes32("x"), 0, 0);
        vm.stopPrank();
    }

    /* ------------------------------------------------------------ mint */

    function test_MintCreditsBalanceAndSupply() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        assertEq(items.balanceOf(alice, LASER), 5);
        assertEq(items.totalSupply(LASER), 5);
    }

    function test_MintBatchMintsEveryId() public {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = LASER;
        ids[1] = SHELL;
        amounts[0] = 3;
        amounts[1] = 7;

        vm.prank(minter);
        items.mintBatch(alice, ids, amounts);
        assertEq(items.balanceOf(alice, LASER), 3);
        assertEq(items.balanceOf(alice, SHELL), 7);
    }

    function test_RevertWhen_BatchLengthsMismatch() public {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](1);
        vm.expectRevert(NovaItems.LengthMismatch.selector);
        vm.prank(minter);
        items.mintBatch(alice, ids, amounts);
    }

    function test_RevertWhen_ExceedingMaxSupply() public {
        vm.prank(minter);
        items.mint(alice, SHELL, 100);
        vm.expectRevert(abi.encodeWithSelector(NovaItems.SupplyExceeded.selector, SHELL, 1, 0));
        vm.prank(minter);
        items.mint(bob, SHELL, 1);
    }

    function test_UnlimitedSupplyItemHasNoCap() public {
        vm.startPrank(minter);
        items.mint(alice, LASER, 1_000_000);
        items.mint(bob, LASER, 1_000_000);
        vm.stopPrank();
        assertEq(items.totalSupply(LASER), 2_000_000);
    }

    function test_RevertWhen_UnauthorizedMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, NovaRoles.MINTER_ROLE
            )
        );
        vm.prank(attacker);
        items.mint(attacker, LASER, 1000);
    }

    function test_RevertWhen_MintingZeroOrToZeroAddress() public {
        vm.startPrank(minter);
        vm.expectRevert(NovaItems.ZeroAmount.selector);
        items.mint(alice, LASER, 0);
        vm.expectRevert(NovaItems.ZeroAddress.selector);
        items.mint(address(0), LASER, 1);
        vm.stopPrank();
    }

    /* --------------------------------------------------- transfer/burn */

    function test_HolderCanTransfer() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        vm.prank(alice);
        items.safeTransferFrom(alice, bob, LASER, 2, "");
        assertEq(items.balanceOf(alice, LASER), 3);
        assertEq(items.balanceOf(bob, LASER), 2);
    }

    function test_RevertWhen_TransferringWithoutApproval() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155MissingApprovalForAll.selector, attacker, alice)
        );
        vm.prank(attacker);
        items.safeTransferFrom(alice, attacker, LASER, 1, "");
    }

    function test_HolderCanBurnAndSupplyDrops() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        vm.prank(alice);
        items.burn(alice, LASER, 2);
        assertEq(items.balanceOf(alice, LASER), 3);
        assertEq(items.totalSupply(LASER), 3);
    }

    function test_RevertWhen_BurningSomeoneElsesItems() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        vm.expectRevert(NovaItems.NotOwnerNorApproved.selector);
        vm.prank(attacker);
        items.burn(alice, LASER, 1);
    }

    function test_ApprovedOperatorCanBurn() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        vm.prank(alice);
        items.setApprovalForAll(bob, true);
        vm.prank(bob);
        items.burn(alice, LASER, 5);
        assertEq(items.totalSupply(LASER), 0);
    }

    function test_BurnFreesSupplyUnderACap() public {
        vm.prank(minter);
        items.mint(alice, SHELL, 100);
        vm.prank(alice);
        items.burn(alice, SHELL, 10);
        vm.prank(minter);
        items.mint(bob, SHELL, 10);
        assertEq(items.totalSupply(SHELL), 100);
    }

    /* -------------------------------------------------------- metadata */

    function test_UriFallsBackToBaseAndHonoursOverride() public {
        assertEq(items.uri(LASER), "https://api.nova.example/item/1");
        vm.prank(admin);
        items.setItemURI(LASER, "ipfs://laser");
        assertEq(items.uri(LASER), "ipfs://laser");
    }

    function test_RevertWhen_SettingUriForUnregisteredItem() public {
        vm.expectRevert(abi.encodeWithSelector(NovaItems.NotRegistered.selector, 404));
        vm.prank(admin);
        items.setItemURI(404, "ipfs://nope");
    }

    /* ----------------------------------------------------------- pause */

    function test_PauseBlocksMintTransferAndBurn() public {
        vm.prank(minter);
        items.mint(alice, LASER, 5);
        vm.prank(admin);
        items.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(minter);
        items.mint(alice, LASER, 1);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        items.safeTransferFrom(alice, bob, LASER, 1, "");

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        items.burn(alice, LASER, 1);
    }

    function test_SupportsExpectedInterfaces() public view {
        assertTrue(items.supportsInterface(type(IERC1155).interfaceId));
        assertTrue(items.supportsInterface(type(IAccessControl).interfaceId));
    }

    function testFuzz_SupplyCapIsNeverExceeded(uint256 first, uint256 second) public {
        first = bound(first, 1, 100);
        second = bound(second, 1, 100);
        vm.prank(minter);
        items.mint(alice, SHELL, first);
        if (first + second > 100) {
            vm.expectRevert(
                abi.encodeWithSelector(NovaItems.SupplyExceeded.selector, SHELL, second, 100 - first)
            );
            vm.prank(minter);
            items.mint(bob, SHELL, second);
            assertEq(items.totalSupply(SHELL), first);
        } else {
            vm.prank(minter);
            items.mint(bob, SHELL, second);
            assertEq(items.totalSupply(SHELL), first + second);
        }
        assertLe(items.totalSupply(SHELL), 100);
    }
}
