// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {NovaAssets} from "../src/NovaAssets.sol";
import {NovaItems} from "../src/NovaItems.sol";
import {NovaMarketplace} from "../src/NovaMarketplace.sol";
import {NovaRewardVault} from "../src/NovaRewardVault.sol";
import {NovaRoles} from "../src/NovaRoles.sol";

/// @notice Deploys the full NOVA STATION contract set and wires it together.
/// @dev Run with:
///      forge script script/Deploy.s.sol:Deploy --rpc-url <url> --broadcast
///
///      Environment:
///        PRIVATE_KEY        deployer key (becomes DEFAULT_ADMIN_ROLE)
///        NOVA_MINTER        address the game server mints from
///        NOVA_SIGNER        address the game server signs reward vouchers with
///        NOVA_TREASURY      fee recipient
///        NOVA_BASE_URI      metadata base, e.g. https://api.nova.example/metadata/
contract Deploy is Script {
    uint96 internal constant FEE_BPS = 250;
    uint96 internal constant TREASURY_SHARE_BPS = 6_000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address minter = vm.envOr("NOVA_MINTER", deployer);
        address signer = vm.envOr("NOVA_SIGNER", deployer);
        address treasury = vm.envOr("NOVA_TREASURY", deployer);
        string memory baseUri = vm.envOr("NOVA_BASE_URI", string("https://nova.local/metadata/"));

        vm.startBroadcast(deployerKey);

        NovaAssets assets = new NovaAssets(deployer, string.concat(baseUri, "asset/"));
        NovaItems items = new NovaItems(deployer, string.concat(baseUri, "item/"));
        NovaRewardVault vault = new NovaRewardVault(deployer, signer);
        NovaMarketplace market =
            new NovaMarketplace(deployer, treasury, address(vault), FEE_BPS, TREASURY_SHARE_BPS);

        // Only the two first-party collections may ever be listed.
        market.setCollectionAllowed(address(assets), true);
        market.setCollectionAllowed(address(items), true);

        // The game server mints; the deployer keeps admin and can rotate it.
        if (minter != deployer) {
            assets.grantRole(NovaRoles.MINTER_ROLE, minter);
            items.grantRole(NovaRoles.MINTER_ROLE, minter);
        }

        _registerItems(items);

        vm.stopBroadcast();

        console2.log("NovaAssets      ", address(assets));
        console2.log("NovaItems       ", address(items));
        console2.log("NovaMarketplace ", address(market));
        console2.log("NovaRewardVault ", address(vault));

        _writeDeployment(address(assets), address(items), address(market), address(vault), deployer);
    }

    /// @dev Opens the on-chain-eligible items from the game catalogue. Ids are
    ///      the stable numeric ids used by the shared item registry in packages/shared.
    function _registerItems(NovaItems items) internal {
        items.registerItem(1, bytes32("module"), bytes32("mining_laser_ii"), 2, 0);
        items.registerItem(2, bytes32("module"), bytes32("harmonic_extractor"), 4, 500);
        items.registerItem(3, bytes32("module"), bytes32("cargo_singularity"), 3, 0);
        items.registerItem(4, bytes32("module"), bytes32("fusion_drive"), 3, 0);
        items.registerItem(5, bytes32("module"), bytes32("aegis_shield"), 2, 0);
        items.registerItem(6, bytes32("module"), bytes32("deep_scanner"), 3, 0);
        items.registerItem(7, bytes32("equipment"), bytes32("suit_voidwalker"), 3, 0);
        items.registerItem(8, bytes32("equipment"), bytes32("tool_refiner"), 2, 0);
        items.registerItem(9, bytes32("cosmetic"), bytes32("pattern_circuit"), 3, 0);
        items.registerItem(10, bytes32("cosmetic"), bytes32("trail_nova"), 4, 1000);
        items.registerItem(11, bytes32("cosmetic"), bytes32("accessory_wings"), 3, 0);
    }

    function _writeDeployment(address assets, address items, address market, address vault, address admin)
        internal
    {
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(block.chainid),
            ",\n",
            '  "admin": "',
            vm.toString(admin),
            '",\n',
            '  "NovaAssets": "',
            vm.toString(assets),
            '",\n',
            '  "NovaItems": "',
            vm.toString(items),
            '",\n',
            '  "NovaMarketplace": "',
            vm.toString(market),
            '",\n',
            '  "NovaRewardVault": "',
            vm.toString(vault),
            '"\n}\n'
        );
        vm.writeFile(string.concat("deployments/", vm.toString(block.chainid), ".json"), json);
    }
}
