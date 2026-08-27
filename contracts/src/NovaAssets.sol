// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {NovaRoles} from "./NovaRoles.sol";

/// @title NovaAssets
/// @notice ERC-721 registry for unique NOVA STATION assets: bespoke hulls,
///         one-off collectibles and event trophies.
/// @dev Only *provenance* lives on-chain — what the asset is, how rare it is,
///      which generation minted it and when. Gameplay statistics that change
///      every session (fuel, cargo, upgrade tiers) stay in the game database,
///      because writing them here would cost a transaction per mining run and
///      would still have to be trusted from the server anyway.
contract NovaAssets is ERC721, ERC721Enumerable, AccessControl, Pausable {
    using Strings for uint256;

    /// @notice Immutable provenance recorded at mint time.
    struct AssetMeta {
        /// @dev Category, e.g. bytes32("ship") or bytes32("collectible").
        bytes32 kind;
        /// @dev Game-data identifier, e.g. bytes32("aurora").
        bytes32 defId;
        /// @dev Rarity index: 0 common … 4 legendary.
        uint8 rarity;
        /// @dev Mint generation, for series that are re-issued.
        uint16 generation;
        /// @dev Block timestamp of the mint.
        uint64 mintedAt;
    }

    uint8 public constant MAX_RARITY = 4;
    uint256 public constant MAX_BATCH = 50;

    uint256 private _nextTokenId = 1;
    string private _baseTokenURI;

    mapping(uint256 tokenId => AssetMeta) private _meta;
    mapping(uint256 tokenId => string) private _tokenURIs;

    error ZeroAddress();
    error UnknownToken(uint256 tokenId);
    error RarityOutOfRange(uint8 rarity);
    error EmptyKind();
    error BatchTooLarge(uint256 requested, uint256 maximum);

    event AssetMinted(
        uint256 indexed tokenId,
        address indexed to,
        bytes32 indexed kind,
        bytes32 defId,
        uint8 rarity,
        uint16 generation
    );
    event BaseURIUpdated(string baseURI);
    event TokenURIUpdated(uint256 indexed tokenId, string tokenURI);

    /// @param admin Receives DEFAULT_ADMIN_ROLE and every operational role.
    /// @param baseURI_ Prefix used when a token has no explicit URI.
    constructor(address admin, string memory baseURI_) ERC721("Nova Station Assets", "NOVA") {
        if (admin == address(0)) revert ZeroAddress();
        _baseTokenURI = baseURI_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(NovaRoles.MINTER_ROLE, admin);
        _grantRole(NovaRoles.PAUSER_ROLE, admin);
        _grantRole(NovaRoles.CURATOR_ROLE, admin);
    }

    /// @notice Mints one unique asset.
    /// @dev Restricted to MINTER_ROLE, which the server holds. There is no
    ///      public mint: every asset in circulation was authorised by the game.
    function mint(
        address to,
        bytes32 kind,
        bytes32 defId,
        uint8 rarity,
        uint16 generation,
        string calldata uri_
    ) external onlyRole(NovaRoles.MINTER_ROLE) whenNotPaused returns (uint256 tokenId) {
        tokenId = _mintOne(to, kind, defId, rarity, generation, uri_);
    }

    /// @notice Mints a run of assets that share a kind, definition and rarity.
    function mintBatch(
        address[] calldata recipients,
        bytes32 kind,
        bytes32 defId,
        uint8 rarity,
        uint16 generation
    ) external onlyRole(NovaRoles.MINTER_ROLE) whenNotPaused returns (uint256[] memory tokenIds) {
        uint256 count = recipients.length;
        if (count > MAX_BATCH) revert BatchTooLarge(count, MAX_BATCH);
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            tokenIds[i] = _mintOne(recipients[i], kind, defId, rarity, generation, "");
        }
    }

    function _mintOne(
        address to,
        bytes32 kind,
        bytes32 defId,
        uint8 rarity,
        uint16 generation,
        string memory uri_
    ) private returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (kind == bytes32(0)) revert EmptyKind();
        if (rarity > MAX_RARITY) revert RarityOutOfRange(rarity);

        tokenId = _nextTokenId++;
        _meta[tokenId] = AssetMeta({
            kind: kind,
            defId: defId,
            rarity: rarity,
            generation: generation,
            mintedAt: uint64(block.timestamp)
        });
        if (bytes(uri_).length != 0) {
            _tokenURIs[tokenId] = uri_;
        }
        _safeMint(to, tokenId);
        emit AssetMinted(tokenId, to, kind, defId, rarity, generation);
    }

    /// @notice Provenance for a token.
    function assetMeta(uint256 tokenId) external view returns (AssetMeta memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken(tokenId);
        return _meta[tokenId];
    }

    /// @notice Every token currently owned by `owner`.
    /// @dev Enumerable is kept deliberately: it lets a client verify ownership
    ///      straight from the chain without trusting the game's own indexer.
    function tokensOfOwner(address owner) external view returns (uint256[] memory tokenIds) {
        uint256 count = balanceOf(owner);
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            tokenIds[i] = tokenOfOwnerByIndex(owner, i);
        }
    }

    /// @notice Next token id that will be issued.
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken(tokenId);
        string memory custom = _tokenURIs[tokenId];
        if (bytes(custom).length != 0) return custom;
        return bytes(_baseTokenURI).length == 0 ? "" : string.concat(_baseTokenURI, tokenId.toString());
    }

    function setBaseURI(string calldata baseURI_) external onlyRole(NovaRoles.CURATOR_ROLE) {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function setTokenURI(uint256 tokenId, string calldata uri_) external onlyRole(NovaRoles.CURATOR_ROLE) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken(tokenId);
        _tokenURIs[tokenId] = uri_;
        emit TokenURIUpdated(tokenId, uri_);
    }

    function pause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _unpause();
    }

    /// @dev Transfers, mints and burns all funnel through here, so pausing this
    ///      single hook freezes every movement of every asset.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        whenNotPaused
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
