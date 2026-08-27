// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {NovaMarketplace} from "../../src/NovaMarketplace.sol";

/// @dev A token that is neither ERC-721 nor ERC-1155, used to prove the
///      marketplace rejects collections it cannot classify.
contract NotAToken {
    function supportsInterface(bytes4) external pure returns (bool) {
        return false;
    }
}

/// @dev A look-alike ERC-721 an attacker might deploy; used to prove the
///      allowlist is what actually gates the marketplace.
contract FakeAsset is ERC721 {
    uint256 private _next = 1;

    constructor() ERC721("Fake Nova", "NOVA") {}

    function mint(address to) external returns (uint256 id) {
        id = _next++;
        _mint(to, id);
    }
}

contract MockERC1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

/// @dev Refuses every incoming ETH transfer. Proves that pull payments stop a
///      hostile seller from bricking their own sale proceeds.
contract RejectingReceiver {
    NovaMarketplace private immutable MARKET;

    constructor(NovaMarketplace market) {
        MARKET = market;
    }

    receive() external payable {
        revert("no thanks");
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function listAsset(address collection, uint256 tokenId, uint256 price) external returns (uint256) {
        return MARKET.list(collection, tokenId, 1, price);
    }

    function approveAll(address collection) external {
        ERC721(collection).setApprovalForAll(address(MARKET), true);
    }

    function tryWithdraw() external {
        MARKET.withdraw();
    }
}

/// @dev Attempts to reenter the marketplace from an ERC-721 transfer callback.
contract ReentrantBuyer {
    NovaMarketplace private immutable MARKET;
    uint256 private _targetListing;
    bool public reentered;
    bool public reentryReverted;

    constructor(NovaMarketplace market) {
        MARKET = market;
    }

    receive() external payable {}

    function attack(uint256 listingId) external payable {
        _targetListing = listingId;
        MARKET.buy{value: msg.value}(listingId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!reentered) {
            reentered = true;
            try MARKET.buy{value: address(this).balance}(_targetListing) {
                reentryReverted = false;
            } catch {
                reentryReverted = true;
            }
        }
        return this.onERC721Received.selector;
    }
}
