// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {NovaAssets} from "../src/NovaAssets.sol";
import {NovaRoles} from "../src/NovaRoles.sol";

contract NovaAssetsTest is Test {
    NovaAssets internal assets;

    address internal admin = makeAddr("admin");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal attacker = makeAddr("attacker");

    bytes32 internal constant SHIP = bytes32("ship");
    bytes32 internal constant AURORA = bytes32("aurora");

    function setUp() public {
        vm.startPrank(admin);
        assets = new NovaAssets(admin, "https://api.nova.example/asset/");
        assets.grantRole(NovaRoles.MINTER_ROLE, minter);
        vm.stopPrank();
    }

    function _mintToAlice() internal returns (uint256) {
        vm.prank(minter);
        return assets.mint(alice, SHIP, AURORA, 4, 1, "");
    }

    /* ------------------------------------------------------------- mint */

    function test_MintAssignsOwnershipAndProvenance() public {
        uint256 id = _mintToAlice();
        assertEq(assets.ownerOf(id), alice);
        assertEq(assets.balanceOf(alice), 1);

        NovaAssets.AssetMeta memory meta = assets.assetMeta(id);
        assertEq(meta.kind, SHIP);
        assertEq(meta.defId, AURORA);
        assertEq(meta.rarity, 4);
        assertEq(meta.generation, 1);
        assertEq(meta.mintedAt, uint64(block.timestamp));
    }

    function test_TokenIdsIncrementFromOne() public {
        assertEq(assets.nextTokenId(), 1);
        assertEq(_mintToAlice(), 1);
        assertEq(_mintToAlice(), 2);
        assertEq(assets.nextTokenId(), 3);
    }

    function test_MintEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit NovaAssets.AssetMinted(1, alice, SHIP, AURORA, 4, 1);
        _mintToAlice();
    }

    function test_RevertWhen_UnauthorizedMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, NovaRoles.MINTER_ROLE
            )
        );
        vm.prank(attacker);
        assets.mint(attacker, SHIP, AURORA, 4, 1, "");
    }

    function test_RevertWhen_MintingToZeroAddress() public {
        vm.expectRevert(NovaAssets.ZeroAddress.selector);
        vm.prank(minter);
        assets.mint(address(0), SHIP, AURORA, 0, 1, "");
    }

    function test_RevertWhen_RarityOutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(NovaAssets.RarityOutOfRange.selector, uint8(5)));
        vm.prank(minter);
        assets.mint(alice, SHIP, AURORA, 5, 1, "");
    }

    function test_RevertWhen_KindIsEmpty() public {
        vm.expectRevert(NovaAssets.EmptyKind.selector);
        vm.prank(minter);
        assets.mint(alice, bytes32(0), AURORA, 0, 1, "");
    }

    function test_BatchMintDistributesToEveryRecipient() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = alice;

        vm.prank(minter);
        uint256[] memory ids = assets.mintBatch(recipients, SHIP, AURORA, 3, 2);

        assertEq(ids.length, 3);
        assertEq(assets.balanceOf(alice), 2);
        assertEq(assets.balanceOf(bob), 1);
        assertEq(assets.assetMeta(ids[1]).generation, 2);
    }

    function test_RevertWhen_BatchTooLarge() public {
        address[] memory recipients = new address[](51);
        for (uint256 i = 0; i < 51; ++i) {
            recipients[i] = alice;
        }
        vm.expectRevert(abi.encodeWithSelector(NovaAssets.BatchTooLarge.selector, 51, 50));
        vm.prank(minter);
        assets.mintBatch(recipients, SHIP, AURORA, 0, 1);
    }

    /* --------------------------------------------------------- transfer */

    function test_OwnerCanTransfer() public {
        uint256 id = _mintToAlice();
        vm.prank(alice);
        assets.transferFrom(alice, bob, id);
        assertEq(assets.ownerOf(id), bob);
    }

    function test_RevertWhen_TransferringSomeoneElsesAsset() public {
        uint256 id = _mintToAlice();
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, attacker, id)
        );
        vm.prank(attacker);
        assets.transferFrom(alice, attacker, id);
    }

    function test_ApprovedOperatorCanTransfer() public {
        uint256 id = _mintToAlice();
        vm.prank(alice);
        assets.setApprovalForAll(bob, true);
        vm.prank(bob);
        assets.transferFrom(alice, bob, id);
        assertEq(assets.ownerOf(id), bob);
    }

    /* ------------------------------------------------------- enumerable */

    function test_TokensOfOwnerTracksTransfers() public {
        uint256 first = _mintToAlice();
        uint256 second = _mintToAlice();

        uint256[] memory owned = assets.tokensOfOwner(alice);
        assertEq(owned.length, 2);

        vm.prank(alice);
        assets.transferFrom(alice, bob, first);

        owned = assets.tokensOfOwner(alice);
        assertEq(owned.length, 1);
        assertEq(owned[0], second);
        assertEq(assets.tokensOfOwner(bob)[0], first);
    }

    function test_TotalSupplyTracksMints() public {
        assertEq(assets.totalSupply(), 0);
        _mintToAlice();
        _mintToAlice();
        assertEq(assets.totalSupply(), 2);
    }

    /* -------------------------------------------------------- metadata */

    function test_TokenURIFallsBackToBaseURI() public {
        uint256 id = _mintToAlice();
        assertEq(assets.tokenURI(id), "https://api.nova.example/asset/1");
    }

    function test_TokenURIPrefersPerTokenOverride() public {
        vm.prank(minter);
        uint256 id = assets.mint(alice, SHIP, AURORA, 4, 1, "ipfs://custom");
        assertEq(assets.tokenURI(id), "ipfs://custom");
    }

    function test_CuratorCanUpdateURIs() public {
        uint256 id = _mintToAlice();
        vm.prank(admin);
        assets.setBaseURI("https://cdn.nova.example/");
        assertEq(assets.tokenURI(id), "https://cdn.nova.example/1");

        vm.prank(admin);
        assets.setTokenURI(id, "ipfs://override");
        assertEq(assets.tokenURI(id), "ipfs://override");
    }

    function test_RevertWhen_NonCuratorSetsBaseURI() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, NovaRoles.CURATOR_ROLE
            )
        );
        vm.prank(attacker);
        assets.setBaseURI("https://evil.example/");
    }

    function test_RevertWhen_QueryingUnknownToken() public {
        vm.expectRevert(abi.encodeWithSelector(NovaAssets.UnknownToken.selector, 99));
        assets.tokenURI(99);
        vm.expectRevert(abi.encodeWithSelector(NovaAssets.UnknownToken.selector, 99));
        assets.assetMeta(99);
    }

    /* ----------------------------------------------------------- pause */

    function test_PauseBlocksMintAndTransfer() public {
        uint256 id = _mintToAlice();
        vm.prank(admin);
        assets.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(minter);
        assets.mint(alice, SHIP, AURORA, 0, 1, "");

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        assets.transferFrom(alice, bob, id);
    }

    function test_UnpauseRestoresTransfers() public {
        uint256 id = _mintToAlice();
        vm.startPrank(admin);
        assets.pause();
        assets.unpause();
        vm.stopPrank();

        vm.prank(alice);
        assets.transferFrom(alice, bob, id);
        assertEq(assets.ownerOf(id), bob);
    }

    function test_RevertWhen_NonPauserPauses() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, NovaRoles.PAUSER_ROLE
            )
        );
        vm.prank(attacker);
        assets.pause();
    }

    /* ------------------------------------------------------------ roles */

    function test_AdminCanRotateMinter() public {
        vm.startPrank(admin);
        assets.revokeRole(NovaRoles.MINTER_ROLE, minter);
        assets.grantRole(NovaRoles.MINTER_ROLE, bob);
        vm.stopPrank();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, minter, NovaRoles.MINTER_ROLE
            )
        );
        vm.prank(minter);
        assets.mint(alice, SHIP, AURORA, 0, 1, "");

        vm.prank(bob);
        assets.mint(alice, SHIP, AURORA, 0, 1, "");
        assertEq(assets.balanceOf(alice), 1);
    }

    function test_RevertWhen_AttackerGrantsThemselvesMinter() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, bytes32(0)
            )
        );
        vm.prank(attacker);
        assets.grantRole(NovaRoles.MINTER_ROLE, attacker);
    }

    function test_SupportsExpectedInterfaces() public view {
        assertTrue(assets.supportsInterface(type(IERC721).interfaceId));
        assertTrue(assets.supportsInterface(type(IAccessControl).interfaceId));
    }

    function testFuzz_MintNeverBreaksSupplyAccounting(uint8 count, uint8 rarity) public {
        count = uint8(bound(count, 1, 30));
        rarity = uint8(bound(rarity, 0, 4));
        for (uint256 i = 0; i < count; ++i) {
            vm.prank(minter);
            assets.mint(alice, SHIP, AURORA, rarity, 1, "");
        }
        assertEq(assets.totalSupply(), count);
        assertEq(assets.balanceOf(alice), count);
        assertEq(assets.tokensOfOwner(alice).length, count);
    }
}
