// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IOracle} from "../IOracle.sol";
import {IERC4626Partial} from "../IERC4626Partial.sol";
import {BaseVault} from "../core/BaseVault.sol";
import {IRocketPoolRouter} from "../vendors/RocketPool/IRocketPoolRouter.sol";
import {RocketPoolVaultBase} from "./RocketPoolVaultBase.sol";

// Need to import this for HH Ignition
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @custom:oz-upgrades-unsafe-allow constructor
contract RocketPoolVault is Initializable, RocketPoolVaultBase {
    uint256[50] private __gap;

    function router() external pure returns (address) {
        return _router;
    }

    function asset() external view returns (address) {
        return _underlying;
    }

    function totalAssets() external view returns (uint256) {
        return _totalAssets();
    }

    function setWeight(
        uint256 _uniswapPortion,
        uint256 _balancerPortion
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setWeight(_uniswapPortion, _balancerPortion);
    }

    constructor(
        address oracle,
        address lm,
        address uniV3Router
    ) RocketPoolVaultBase(lm, uniV3Router, oracle, 0xae78736Cd615f374D3085123A210448E74Fc6393) {
    }

    function initialize(uint24 _fee, string memory _name, string memory _symbol, address _admin, address _upgrader) external virtual initializer {
        __RocketPoolVault_init(_fee, _name, _symbol, _admin, _upgrader);
        IERC20(_underlying).approve(_router, type(uint256).max);
    }

    function __RocketPoolVault_init(uint24 _fee, string memory _name, string memory _symbol, address _admin, address _upgrader) internal onlyInitializing {
        __RocketPoolVaultBase_init(_fee, _name, _symbol, _admin, _upgrader);
    }

    /*
     * @notice Queue a withdrawal from the vault
     * @param shares The amount of shares to withdraw
     * @param receiver The address to receive the assets
     * @param owner The address of the owner of the shares
     * @return index The index of the withdrawal
     * @return cliff The time the withdrawal will be processed
     */
    function queueWithdraw(
        uint256 shares,
        address receiver,
        address owner
    ) external virtual onlyLM returns (uint256 index, uint256 cliff) {
        // compute how much we burn
        (index, cliff) = _queueWithdraw(shares, receiver, owner);
        emit QueueWithdraw(msg.sender, shares, receiver, owner, cliff, nonce);
        return (index, cliff);
    }

    /*
     * @notice Withdraw assets from the vault
     * @param index The index of the withdrawal
     * @return assets The amount of assets to withdraw
     */
    function withdraw(
        uint256 index
    ) external virtual nonReentrant onlyLM returns (uint256 assets) {
        assets = _withdraw(index);

        emit Withdraw(msg.sender, assets);
        return assets;
    }

    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _emergencyWithdraw(_msgSender());
    }
}
