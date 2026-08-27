// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {NovaRoles} from "./NovaRoles.sol";

/// @title NovaMarketplace
/// @notice Escrowed order book for NOVA STATION assets, priced in ETH.
/// @dev Three deliberate design choices carry most of the security weight:
///
///      1. **Escrow, not approval.** Listing moves the asset into this
///         contract. A buyer can never pay for an asset the seller quietly
///         moved away, and a cancelled listing returns the asset atomically.
///
///      2. **Pull payments.** Sale proceeds are credited to a balance and
///         withdrawn in a separate transaction. No ETH is ever pushed to an
///         address during a purchase, which removes reentrancy and the
///         griefing vector of a seller whose `receive` always reverts.
///
///      3. **Collection allowlist.** Only contracts an admin has approved can
///         be listed, so the market cannot be used to sell a look-alike token
///         from an attacker-deployed contract.
contract NovaMarketplace is AccessControl, Pausable, ReentrancyGuard, ERC721Holder, ERC1155Holder {
    enum Standard {
        ERC721,
        ERC1155
    }

    struct Listing {
        address seller;
        address collection;
        uint256 tokenId;
        /// @dev Always 1 for ERC-721.
        uint256 amount;
        /// @dev Total price in wei for the whole lot.
        uint256 price;
        Standard standard;
        bool active;
        uint64 createdAt;
    }

    /// @notice Hard ceiling on the fee an admin can ever set: 10%.
    uint96 public constant MAX_FEE_BPS = 1_000;
    uint96 public constant BPS_DENOMINATOR = 10_000;

    uint96 public feeBps;
    /// @notice Share of the fee routed to the treasury; the remainder funds the vault.
    uint96 public treasuryShareBps;
    address public treasury;
    address public rewardVault;

    uint256 private _nextListingId = 1;

    mapping(uint256 listingId => Listing) private _listings;
    mapping(address collection => bool) public allowedCollection;
    /// @notice Withdrawable balances: sale proceeds, fees and refunds.
    mapping(address account => uint256) public pendingWithdrawal;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroPrice();
    error CollectionNotAllowed(address collection);
    error ListingNotFound(uint256 listingId);
    error ListingInactive(uint256 listingId);
    error NotSeller(uint256 listingId, address caller);
    error IncorrectPayment(uint256 expected, uint256 received);
    error CannotBuyOwnListing();
    error FeeTooHigh(uint96 requested, uint96 maximum);
    error ShareTooHigh(uint96 requested);
    error NothingToWithdraw();
    error WithdrawFailed();
    error UnsupportedStandard(address collection);
    error AmountMustBeOneForERC721();

    event CollectionAllowed(address indexed collection, bool allowed);
    event FeeUpdated(uint96 feeBps, uint96 treasuryShareBps);
    event PayoutTargetsUpdated(address treasury, address rewardVault);
    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        Standard standard
    );
    event PriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice);
    event Cancelled(uint256 indexed listingId, address indexed seller);
    event Sold(
        uint256 indexed listingId, address indexed buyer, address indexed seller, uint256 price, uint256 fee
    );
    event Withdrawn(address indexed account, uint256 amount);

    constructor(
        address admin,
        address treasury_,
        address rewardVault_,
        uint96 feeBps_,
        uint96 treasuryShareBps_
    ) {
        if (admin == address(0) || treasury_ == address(0) || rewardVault_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_, MAX_FEE_BPS);
        if (treasuryShareBps_ > BPS_DENOMINATOR) revert ShareTooHigh(treasuryShareBps_);

        treasury = treasury_;
        rewardVault = rewardVault_;
        feeBps = feeBps_;
        treasuryShareBps = treasuryShareBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(NovaRoles.MARKET_ADMIN_ROLE, admin);
        _grantRole(NovaRoles.PAUSER_ROLE, admin);
    }

    /* ------------------------------------------------------------ admin */

    function setCollectionAllowed(address collection, bool allowed)
        external
        onlyRole(NovaRoles.MARKET_ADMIN_ROLE)
    {
        if (collection == address(0)) revert ZeroAddress();
        allowedCollection[collection] = allowed;
        emit CollectionAllowed(collection, allowed);
    }

    function setFee(uint96 feeBps_, uint96 treasuryShareBps_) external onlyRole(NovaRoles.MARKET_ADMIN_ROLE) {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_, MAX_FEE_BPS);
        if (treasuryShareBps_ > BPS_DENOMINATOR) revert ShareTooHigh(treasuryShareBps_);
        feeBps = feeBps_;
        treasuryShareBps = treasuryShareBps_;
        emit FeeUpdated(feeBps_, treasuryShareBps_);
    }

    function setPayoutTargets(address treasury_, address rewardVault_)
        external
        onlyRole(NovaRoles.MARKET_ADMIN_ROLE)
    {
        if (treasury_ == address(0) || rewardVault_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        rewardVault = rewardVault_;
        emit PayoutTargetsUpdated(treasury_, rewardVault_);
    }

    function pause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _unpause();
    }

    /* ---------------------------------------------------------- listing */

    /// @notice Escrows an asset and opens a listing for it.
    function list(address collection, uint256 tokenId, uint256 amount, uint256 price)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 listingId)
    {
        if (!allowedCollection[collection]) revert CollectionNotAllowed(collection);
        if (price == 0) revert ZeroPrice();
        if (amount == 0) revert ZeroAmount();

        Standard standard = _detectStandard(collection);
        if (standard == Standard.ERC721 && amount != 1) revert AmountMustBeOneForERC721();

        listingId = _nextListingId++;
        _listings[listingId] = Listing({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            price: price,
            standard: standard,
            active: true,
            createdAt: uint64(block.timestamp)
        });

        emit Listed(listingId, msg.sender, collection, tokenId, amount, price, standard);

        // Interaction last: the listing is fully recorded before the escrow
        // transfer, and a hostile token that reenters finds a consistent state.
        if (standard == Standard.ERC721) {
            IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);
        } else {
            IERC1155(collection).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        }
    }

    /// @notice Changes the asking price of an open listing.
    function updatePrice(uint256 listingId, uint256 newPrice) external whenNotPaused {
        Listing storage listing = _requireActive(listingId);
        if (listing.seller != msg.sender) revert NotSeller(listingId, msg.sender);
        if (newPrice == 0) revert ZeroPrice();
        uint256 oldPrice = listing.price;
        listing.price = newPrice;
        emit PriceUpdated(listingId, oldPrice, newPrice);
    }

    /// @notice Closes a listing and returns the escrowed asset to the seller.
    /// @dev An admin may cancel on a seller's behalf so that a listing can
    ///      always be unwound while the marketplace is being wound down.
    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = _requireActive(listingId);
        bool isAdmin = hasRole(NovaRoles.MARKET_ADMIN_ROLE, msg.sender);
        if (listing.seller != msg.sender && !isAdmin) revert NotSeller(listingId, msg.sender);

        listing.active = false;
        address seller = listing.seller;
        emit Cancelled(listingId, seller);
        _releaseAsset(listing, seller);
    }

    /// @notice Buys a listing outright. The exact price must be sent.
    function buy(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = _requireActive(listingId);
        if (listing.seller == msg.sender) revert CannotBuyOwnListing();

        uint256 price = listing.price;
        if (msg.value != price) revert IncorrectPayment(price, msg.value);

        // Effects first: the listing is closed and every balance is credited
        // before a single external call is made.
        listing.active = false;

        uint256 fee = (price * feeBps) / BPS_DENOMINATOR;
        uint256 proceeds = price - fee;
        uint256 treasuryCut = (fee * treasuryShareBps) / BPS_DENOMINATOR;
        uint256 vaultCut = fee - treasuryCut;

        address seller = listing.seller;
        pendingWithdrawal[seller] += proceeds;
        if (treasuryCut != 0) pendingWithdrawal[treasury] += treasuryCut;
        if (vaultCut != 0) pendingWithdrawal[rewardVault] += vaultCut;

        emit Sold(listingId, msg.sender, seller, price, fee);

        _releaseAsset(listing, msg.sender);
    }

    /// @notice Withdraws everything owed to the caller.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawal[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawal[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    /// @notice Withdraws on behalf of an address that cannot call this contract
    ///         itself, such as the reward vault.
    /// @dev Still a pull, and still credited to the rightful owner — an admin
    ///      can only push funds to where they were already owed.
    function withdrawFor(address account) external nonReentrant onlyRole(NovaRoles.MARKET_ADMIN_ROLE) {
        uint256 amount = pendingWithdrawal[account];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawal[account] = 0;
        emit Withdrawn(account, amount);
        (bool ok,) = payable(account).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    /* ------------------------------------------------------------ views */

    function getListing(uint256 listingId) external view returns (Listing memory) {
        Listing memory listing = _listings[listingId];
        if (listing.seller == address(0)) revert ListingNotFound(listingId);
        return listing;
    }

    function nextListingId() external view returns (uint256) {
        return _nextListingId;
    }

    /// @notice Quotes what a sale at `price` would pay out and charge.
    function quote(uint256 price) external view returns (uint256 fee, uint256 proceeds) {
        fee = (price * feeBps) / BPS_DENOMINATOR;
        proceeds = price - fee;
    }

    /* --------------------------------------------------------- internal */

    function _requireActive(uint256 listingId) private view returns (Listing storage listing) {
        listing = _listings[listingId];
        if (listing.seller == address(0)) revert ListingNotFound(listingId);
        if (!listing.active) revert ListingInactive(listingId);
    }

    function _releaseAsset(Listing storage listing, address to) private {
        if (listing.standard == Standard.ERC721) {
            IERC721(listing.collection).safeTransferFrom(address(this), to, listing.tokenId);
        } else {
            IERC1155(listing.collection)
                .safeTransferFrom(address(this), to, listing.tokenId, listing.amount, "");
        }
    }

    function _detectStandard(address collection) private view returns (Standard) {
        if (IERC165(collection).supportsInterface(type(IERC721).interfaceId)) return Standard.ERC721;
        if (IERC165(collection).supportsInterface(type(IERC1155).interfaceId)) return Standard.ERC1155;
        revert UnsupportedStandard(collection);
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
