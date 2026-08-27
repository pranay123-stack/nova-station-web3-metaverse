// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {NovaAssets} from "../src/NovaAssets.sol";
import {NovaItems} from "../src/NovaItems.sol";
import {NovaMarketplace} from "../src/NovaMarketplace.sol";
import {NovaRoles} from "../src/NovaRoles.sol";
import {FakeAsset, MockERC1155, NotAToken, RejectingReceiver, ReentrantBuyer} from "./mocks/Mocks.sol";

contract NovaMarketplaceTest is Test {
    NovaAssets internal assets;
    NovaItems internal items;
    NovaMarketplace internal market;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal vault = makeAddr("vault");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal attacker = makeAddr("attacker");

    uint96 internal constant FEE_BPS = 250;
    uint96 internal constant TREASURY_SHARE = 6_000;
    uint256 internal constant ITEM_ID = 1;

    function setUp() public {
        vm.startPrank(admin);
        assets = new NovaAssets(admin, "https://api.nova.example/asset/");
        items = new NovaItems(admin, "https://api.nova.example/item/");
        market = new NovaMarketplace(admin, treasury, vault, FEE_BPS, TREASURY_SHARE);
        market.setCollectionAllowed(address(assets), true);
        market.setCollectionAllowed(address(items), true);
        items.registerItem(ITEM_ID, bytes32("module"), bytes32("mining_laser_ii"), 2, 0);
        items.mint(alice, ITEM_ID, 10);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(attacker, 100 ether);
    }

    function _mintAndList(uint256 price) internal returns (uint256 listingId, uint256 tokenId) {
        vm.prank(admin);
        tokenId = assets.mint(alice, bytes32("ship"), bytes32("aurora"), 4, 1, "");
        vm.startPrank(alice);
        assets.setApprovalForAll(address(market), true);
        listingId = market.list(address(assets), tokenId, 1, price);
        vm.stopPrank();
    }

    /* --------------------------------------------------------- listing */

    function test_ListingEscrowsTheAsset() public {
        (uint256 listingId, uint256 tokenId) = _mintAndList(1 ether);
        assertEq(assets.ownerOf(tokenId), address(market));

        NovaMarketplace.Listing memory listing = market.getListing(listingId);
        assertEq(listing.seller, alice);
        assertEq(listing.price, 1 ether);
        assertTrue(listing.active);
        assertEq(uint8(listing.standard), uint8(NovaMarketplace.Standard.ERC721));
    }

    function test_ListingDetectsERC1155() public {
        vm.startPrank(alice);
        items.setApprovalForAll(address(market), true);
        uint256 listingId = market.list(address(items), ITEM_ID, 4, 2 ether);
        vm.stopPrank();

        NovaMarketplace.Listing memory listing = market.getListing(listingId);
        assertEq(uint8(listing.standard), uint8(NovaMarketplace.Standard.ERC1155));
        assertEq(items.balanceOf(address(market), ITEM_ID), 4);
        assertEq(items.balanceOf(alice, ITEM_ID), 6);
    }

    function test_RevertWhen_ListingUnallowedCollection() public {
        FakeAsset fake = new FakeAsset();
        uint256 id = fake.mint(attacker);
        vm.startPrank(attacker);
        fake.setApprovalForAll(address(market), true);
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.CollectionNotAllowed.selector, address(fake)));
        market.list(address(fake), id, 1, 1 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_ListingUnsupportedStandard() public {
        NotAToken junk = new NotAToken();
        vm.prank(admin);
        market.setCollectionAllowed(address(junk), true);
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.UnsupportedStandard.selector, address(junk)));
        vm.prank(alice);
        market.list(address(junk), 1, 1, 1 ether);
    }

    function test_RevertWhen_ListingWithZeroPriceOrAmount() public {
        vm.prank(admin);
        uint256 tokenId = assets.mint(alice, bytes32("ship"), bytes32("aurora"), 4, 1, "");
        vm.startPrank(alice);
        assets.setApprovalForAll(address(market), true);
        vm.expectRevert(NovaMarketplace.ZeroPrice.selector);
        market.list(address(assets), tokenId, 1, 0);
        vm.expectRevert(NovaMarketplace.ZeroAmount.selector);
        market.list(address(assets), tokenId, 0, 1 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_ListingERC721WithAmountAboveOne() public {
        vm.prank(admin);
        uint256 tokenId = assets.mint(alice, bytes32("ship"), bytes32("aurora"), 4, 1, "");
        vm.startPrank(alice);
        assets.setApprovalForAll(address(market), true);
        vm.expectRevert(NovaMarketplace.AmountMustBeOneForERC721.selector);
        market.list(address(assets), tokenId, 2, 1 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_ListingAnAssetYouDoNotOwn() public {
        vm.prank(admin);
        uint256 tokenId = assets.mint(alice, bytes32("ship"), bytes32("aurora"), 4, 1, "");
        vm.prank(attacker);
        vm.expectRevert();
        market.list(address(assets), tokenId, 1, 1 ether);
    }

    /* ------------------------------------------------------------- buy */

    function test_BuyTransfersAssetAndSplitsProceeds() public {
        (uint256 listingId, uint256 tokenId) = _mintAndList(10 ether);

        vm.prank(bob);
        market.buy{value: 10 ether}(listingId);

        assertEq(assets.ownerOf(tokenId), bob);
        assertFalse(market.getListing(listingId).active);

        uint256 fee = (10 ether * FEE_BPS) / 10_000;
        uint256 treasuryCut = (fee * TREASURY_SHARE) / 10_000;
        assertEq(market.pendingWithdrawal(alice), 10 ether - fee);
        assertEq(market.pendingWithdrawal(treasury), treasuryCut);
        assertEq(market.pendingWithdrawal(vault), fee - treasuryCut);
    }

    function test_QuoteMatchesWhatBuyActuallyCharges() public {
        (uint256 listingId,) = _mintAndList(7 ether);
        (uint256 fee, uint256 proceeds) = market.quote(7 ether);
        vm.prank(bob);
        market.buy{value: 7 ether}(listingId);
        assertEq(market.pendingWithdrawal(alice), proceeds);
        assertEq(market.pendingWithdrawal(treasury) + market.pendingWithdrawal(vault), fee);
    }

    function test_RevertWhen_PayingTheWrongAmount() public {
        (uint256 listingId,) = _mintAndList(5 ether);
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.IncorrectPayment.selector, 5 ether, 4 ether));
        vm.prank(bob);
        market.buy{value: 4 ether}(listingId);

        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.IncorrectPayment.selector, 5 ether, 6 ether));
        vm.prank(bob);
        market.buy{value: 6 ether}(listingId);
    }

    function test_RevertWhen_BuyingTwice() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.prank(bob);
        market.buy{value: 1 ether}(listingId);
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.ListingInactive.selector, listingId));
        vm.prank(attacker);
        market.buy{value: 1 ether}(listingId);
    }

    function test_RevertWhen_BuyingYourOwnListing() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.expectRevert(NovaMarketplace.CannotBuyOwnListing.selector);
        vm.prank(alice);
        market.buy{value: 1 ether}(listingId);
    }

    function test_RevertWhen_BuyingUnknownListing() public {
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.ListingNotFound.selector, 42));
        vm.prank(bob);
        market.buy{value: 1 ether}(42);
    }

    /* -------------------------------------------------------- withdraw */

    function test_SellerWithdrawsProceeds() public {
        (uint256 listingId,) = _mintAndList(10 ether);
        vm.prank(bob);
        market.buy{value: 10 ether}(listingId);

        uint256 before = alice.balance;
        uint256 owed = market.pendingWithdrawal(alice);
        vm.prank(alice);
        market.withdraw();
        assertEq(alice.balance, before + owed);
        assertEq(market.pendingWithdrawal(alice), 0);
    }

    function test_RevertWhen_WithdrawingNothing() public {
        vm.expectRevert(NovaMarketplace.NothingToWithdraw.selector);
        vm.prank(alice);
        market.withdraw();
    }

    function test_RevertWhen_WithdrawingTwice() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.prank(bob);
        market.buy{value: 1 ether}(listingId);
        vm.startPrank(alice);
        market.withdraw();
        vm.expectRevert(NovaMarketplace.NothingToWithdraw.selector);
        market.withdraw();
        vm.stopPrank();
    }

    function test_HostileSellerCannotBrickTheirOwnSale() public {
        // A seller whose `receive` always reverts would break a push-payment
        // marketplace. With pull payments the sale settles regardless; only
        // that seller's own withdrawal fails.
        RejectingReceiver seller = new RejectingReceiver(market);
        vm.prank(admin);
        uint256 tokenId = assets.mint(address(seller), bytes32("ship"), bytes32("aurora"), 4, 1, "");
        seller.approveAll(address(assets));
        uint256 listingId = seller.listAsset(address(assets), tokenId, 1 ether);

        vm.prank(bob);
        market.buy{value: 1 ether}(listingId);

        assertEq(assets.ownerOf(tokenId), bob);
        assertGt(market.pendingWithdrawal(address(seller)), 0);

        vm.expectRevert(NovaMarketplace.WithdrawFailed.selector);
        seller.tryWithdraw();
    }

    function test_AdminCanWithdrawOnBehalfOfTheVault() public {
        (uint256 listingId,) = _mintAndList(10 ether);
        vm.prank(bob);
        market.buy{value: 10 ether}(listingId);

        uint256 owed = market.pendingWithdrawal(vault);
        assertGt(owed, 0);
        vm.prank(admin);
        market.withdrawFor(vault);
        assertEq(vault.balance, owed);
        assertEq(market.pendingWithdrawal(vault), 0);
    }

    function test_RevertWhen_NonAdminWithdrawsForAnotherAccount() public {
        (uint256 listingId,) = _mintAndList(10 ether);
        vm.prank(bob);
        market.buy{value: 10 ether}(listingId);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                attacker,
                NovaRoles.MARKET_ADMIN_ROLE
            )
        );
        vm.prank(attacker);
        market.withdrawFor(alice);
    }

    /* ---------------------------------------------------- cancel/update */

    function test_CancelReturnsTheEscrowedAsset() public {
        (uint256 listingId, uint256 tokenId) = _mintAndList(1 ether);
        vm.prank(alice);
        market.cancel(listingId);
        assertEq(assets.ownerOf(tokenId), alice);
        assertFalse(market.getListing(listingId).active);
    }

    function test_RevertWhen_BuyingCancelledListing() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.prank(alice);
        market.cancel(listingId);
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.ListingInactive.selector, listingId));
        vm.prank(bob);
        market.buy{value: 1 ether}(listingId);
    }

    function test_RevertWhen_StrangerCancels() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.NotSeller.selector, listingId, attacker));
        vm.prank(attacker);
        market.cancel(listingId);
    }

    function test_AdminCanUnwindAListing() public {
        (uint256 listingId, uint256 tokenId) = _mintAndList(1 ether);
        vm.prank(admin);
        market.cancel(listingId);
        assertEq(assets.ownerOf(tokenId), alice);
    }

    function test_SellerCanRepriceButNobodyElseCan() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.prank(alice);
        market.updatePrice(listingId, 3 ether);
        assertEq(market.getListing(listingId).price, 3 ether);

        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.NotSeller.selector, listingId, attacker));
        vm.prank(attacker);
        market.updatePrice(listingId, 1 wei);

        vm.expectRevert(abi.encodeWithSelector(NovaMarketplace.IncorrectPayment.selector, 3 ether, 1 ether));
        vm.prank(bob);
        market.buy{value: 1 ether}(listingId);
    }

    /* ----------------------------------------------------- reentrancy */

    function test_ReentrantBuyerCannotDrainTheListing() public {
        (uint256 listingId, uint256 tokenId) = _mintAndList(1 ether);
        ReentrantBuyer evil = new ReentrantBuyer(market);
        vm.deal(address(evil), 5 ether);

        evil.attack{value: 1 ether}(listingId);

        assertTrue(evil.reentered(), "callback did not fire");
        assertTrue(evil.reentryReverted(), "reentrant buy was not rejected");
        assertEq(assets.ownerOf(tokenId), address(evil));
        assertEq(market.pendingWithdrawal(alice), 1 ether - (1 ether * FEE_BPS) / 10_000);
    }

    /* ---------------------------------------------------------- admin */

    function test_FeeChangesApplyToNewSales() public {
        vm.prank(admin);
        market.setFee(1_000, 5_000);
        (uint256 listingId,) = _mintAndList(10 ether);
        vm.prank(bob);
        market.buy{value: 10 ether}(listingId);
        assertEq(market.pendingWithdrawal(alice), 9 ether);
        assertEq(market.pendingWithdrawal(treasury), 0.5 ether);
        assertEq(market.pendingWithdrawal(vault), 0.5 ether);
    }

    function test_RevertWhen_FeeAboveTheHardCap() public {
        vm.expectRevert(
            abi.encodeWithSelector(NovaMarketplace.FeeTooHigh.selector, uint96(1_001), uint96(1_000))
        );
        vm.prank(admin);
        market.setFee(1_001, 5_000);
    }

    function test_RevertWhen_NonAdminChangesFees() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                attacker,
                NovaRoles.MARKET_ADMIN_ROLE
            )
        );
        vm.prank(attacker);
        market.setFee(0, 0);
    }

    function test_PauseStopsListingAndBuyingButNotCancelling() public {
        (uint256 listingId,) = _mintAndList(1 ether);
        vm.prank(admin);
        market.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(bob);
        market.buy{value: 1 ether}(listingId);

        // Cancelling must keep working so sellers can always recover escrow.
        vm.prank(alice);
        market.cancel(listingId);
    }

    function test_ZeroFeePaysTheSellerEverything() public {
        vm.prank(admin);
        market.setFee(0, 0);
        (uint256 listingId,) = _mintAndList(3 ether);
        vm.prank(bob);
        market.buy{value: 3 ether}(listingId);
        assertEq(market.pendingWithdrawal(alice), 3 ether);
        assertEq(market.pendingWithdrawal(treasury), 0);
    }

    function test_RevertWhen_ConstructedWithZeroAddresses() public {
        vm.expectRevert(NovaMarketplace.ZeroAddress.selector);
        new NovaMarketplace(address(0), treasury, vault, FEE_BPS, TREASURY_SHARE);
    }

    /* ----------------------------------------------------------- fuzz */

    function testFuzz_FeeAndProceedsAlwaysSumToThePrice(uint96 price, uint96 fee) public {
        price = uint96(bound(price, 1, type(uint96).max / 2));
        fee = uint96(bound(fee, 0, 1_000));
        vm.prank(admin);
        market.setFee(fee, TREASURY_SHARE);

        (uint256 listingId,) = _mintAndList(price);
        vm.deal(bob, uint256(price) + 1 ether);
        vm.prank(bob);
        market.buy{value: price}(listingId);

        uint256 total = market.pendingWithdrawal(alice) + market.pendingWithdrawal(treasury)
            + market.pendingWithdrawal(vault);
        assertEq(total, price, "value leaked or was created");
        assertEq(address(market).balance, price);
    }

    function testFuzz_MarketNeverHoldsMoreThanItOwes(uint96 priceA, uint96 priceB) public {
        priceA = uint96(bound(priceA, 1, 10 ether));
        priceB = uint96(bound(priceB, 1, 10 ether));

        (uint256 listingA,) = _mintAndList(priceA);
        (uint256 listingB,) = _mintAndList(priceB);

        vm.prank(bob);
        market.buy{value: priceA}(listingA);
        vm.prank(attacker);
        market.buy{value: priceB}(listingB);

        uint256 owed = market.pendingWithdrawal(alice) + market.pendingWithdrawal(treasury)
            + market.pendingWithdrawal(vault);
        assertEq(address(market).balance, owed);
    }
}
