// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {NovaRoles} from "./NovaRoles.sol";

/// @title NovaItems
/// @notice ERC-1155 registry for semi-fungible NOVA STATION items: ship
///         modules, equipment and cosmetics that many players can hold copies
///         of, but which are still individually identifiable by type.
/// @dev Every id must be *registered* before it can be minted. Without that
///      step a compromised minter key could mint arbitrary unknown ids that the
///      game would then have to decide how to interpret; requiring curation
///      first keeps the item space closed.
contract NovaItems is ERC1155, ERC1155Supply, AccessControl, Pausable {
    using Strings for uint256;

    struct ItemMeta {
        /// @dev Category: "module", "equipment" or "cosmetic".
        bytes32 kind;
        /// @dev Game-data identifier, e.g. bytes32("mining_laser_ii").
        bytes32 defId;
        uint8 rarity;
        /// @dev 0 means unlimited. Enforced on every mint.
        uint256 maxSupply;
        bool registered;
    }

    uint8 public constant MAX_RARITY = 4;
    uint256 public constant MAX_BATCH = 100;

    string private _baseTokenURI;
    mapping(uint256 id => ItemMeta) private _meta;
    mapping(uint256 id => string) private _tokenURIs;

    error ZeroAddress();
    error ZeroAmount();
    error AlreadyRegistered(uint256 id);
    error NotRegistered(uint256 id);
    error RarityOutOfRange(uint8 rarity);
    error EmptyKind();
    error SupplyExceeded(uint256 id, uint256 requested, uint256 remaining);
    error BatchTooLarge(uint256 requested, uint256 maximum);
    error LengthMismatch();
    error NotOwnerNorApproved();

    event ItemRegistered(
        uint256 indexed id, bytes32 indexed kind, bytes32 defId, uint8 rarity, uint256 maxSupply
    );
    event ItemMinted(uint256 indexed id, address indexed to, uint256 amount);
    event BaseURIUpdated(string baseURI);
    event ItemURIUpdated(uint256 indexed id, string uri);

    constructor(address admin, string memory baseURI_) ERC1155(baseURI_) {
        if (admin == address(0)) revert ZeroAddress();
        _baseTokenURI = baseURI_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(NovaRoles.MINTER_ROLE, admin);
        _grantRole(NovaRoles.PAUSER_ROLE, admin);
        _grantRole(NovaRoles.CURATOR_ROLE, admin);
    }

    /// @notice Opens an item id for minting.
    function registerItem(uint256 id, bytes32 kind, bytes32 defId, uint8 rarity, uint256 maxSupply)
        external
        onlyRole(NovaRoles.CURATOR_ROLE)
    {
        if (_meta[id].registered) revert AlreadyRegistered(id);
        if (kind == bytes32(0)) revert EmptyKind();
        if (rarity > MAX_RARITY) revert RarityOutOfRange(rarity);
        _meta[id] =
            ItemMeta({kind: kind, defId: defId, rarity: rarity, maxSupply: maxSupply, registered: true});
        emit ItemRegistered(id, kind, defId, rarity, maxSupply);
    }

    function mint(address to, uint256 id, uint256 amount)
        external
        onlyRole(NovaRoles.MINTER_ROLE)
        whenNotPaused
    {
        _mintChecked(to, id, amount);
    }

    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts)
        external
        onlyRole(NovaRoles.MINTER_ROLE)
        whenNotPaused
    {
        uint256 count = ids.length;
        if (count != amounts.length) revert LengthMismatch();
        if (count > MAX_BATCH) revert BatchTooLarge(count, MAX_BATCH);
        for (uint256 i = 0; i < count; ++i) {
            _mintChecked(to, ids[i], amounts[i]);
        }
    }

    function _mintChecked(address to, uint256 id, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        ItemMeta storage meta = _meta[id];
        if (!meta.registered) revert NotRegistered(id);
        if (meta.maxSupply != 0) {
            uint256 minted = totalSupply(id);
            if (minted + amount > meta.maxSupply) {
                revert SupplyExceeded(id, amount, meta.maxSupply - minted);
            }
        }
        _mint(to, id, amount, "");
        emit ItemMinted(id, to, amount);
    }

    /// @notice Destroys items held by `from`. Used when an item is consumed
    ///         in-game, and callable only by the holder or an approved operator.
    function burn(address from, uint256 id, uint256 amount) external whenNotPaused {
        if (from != _msgSender() && !isApprovedForAll(from, _msgSender())) revert NotOwnerNorApproved();
        _burn(from, id, amount);
    }

    function itemMeta(uint256 id) external view returns (ItemMeta memory) {
        return _meta[id];
    }

    function isRegistered(uint256 id) external view returns (bool) {
        return _meta[id].registered;
    }

    function uri(uint256 id) public view override returns (string memory) {
        string memory custom = _tokenURIs[id];
        if (bytes(custom).length != 0) return custom;
        return bytes(_baseTokenURI).length == 0 ? "" : string.concat(_baseTokenURI, id.toString());
    }

    function setBaseURI(string calldata baseURI_) external onlyRole(NovaRoles.CURATOR_ROLE) {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function setItemURI(uint256 id, string calldata uri_) external onlyRole(NovaRoles.CURATOR_ROLE) {
        if (!_meta[id].registered) revert NotRegistered(id);
        _tokenURIs[id] = uri_;
        emit ItemURIUpdated(id, uri_);
    }

    function pause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(NovaRoles.PAUSER_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
        whenNotPaused
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
