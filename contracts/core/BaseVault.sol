// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IOracle} from "../IOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDelegationManager} from "../vendors/EigenLayer/IDelegationManager.sol";
import {IERC4626Partial} from "../IERC4626Partial.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
abstract contract BaseVault is Initializable, UUPSUpgradeable, ERC20Upgradeable, AccessControlUpgradeable, IERC4626Partial {
    using SafeERC20 for IERC20;

    error NotUpgrader();

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct Queue {
        uint256 amount;
        address receiver;
        address owner;
        uint256 cliff;
        bool processed;
        IDelegationManager.Withdrawal withdrawalRequest;
        address asset;
    }

    uint256 public constant SCALE = 1e18;

    uint256 public nextWithdrawIndex;
    mapping(uint256 => Queue) public withdrawQueue;
    uint256 public pendingWithdraws; // Assets in ETH pending to be withdrawn

    address public immutable _underlying;
    IOracle public immutable _oracle;
    address public constant _univ3router =
        0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public constant _weth =
        0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // WETH9
    address public immutable liquidityManager;
    uint256 public nonce;
    uint24 private fee;

    uint256[50] private __gap;

    modifier onlyLM() {
        require(msg.sender == liquidityManager, "only LM");
        _;
    }

    constructor(address _liquidityManager, address _oracleAddress, address _underlyingAddress) {
        require(_liquidityManager != address(0), "bv: liquidity 0");
        require(_oracleAddress != address(0), "bv: oracle 0");
        require(_underlyingAddress != address(0), "bv: underlying 0");
        liquidityManager = _liquidityManager;
        _oracle = IOracle(_oracleAddress);
        _underlying = _underlyingAddress;
    }

    function __BaseVault_init(uint24 _fee, string memory _name, string memory _symbol, address _admin, address _upgrader) internal onlyInitializing {
        __ERC20_init(_name, _symbol);
        __AccessControl_init();
        fee = _fee;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _upgrader);
    }

    function virtualBalance() external returns (uint256) {
        return _virtualBalance();
    }

    function _virtualBalance() internal virtual returns (uint256) {
        uint256 ethValue = _oracle.getValueInEth(_underlying);
        return (_totalAssets() * ethValue) / SCALE;
    }

    function _totalAssets() internal view virtual returns (uint256) {
        return IERC20(_underlying).balanceOf(address(this));
    }

    function _deposit(
        uint256 assets,
        address receiver
    ) internal virtual returns (uint256) {
        if (assets > 0) {
            // Transfer the assets to the vault
            IERC20(_underlying).safeTransferFrom(msg.sender, address(this), assets);
        }

        _mint(receiver, assets);
        return assets;
    }

    function _authorizeUpgrade(address) internal view override {
        if (!hasRole(UPGRADER_ROLE, msg.sender)) {
            revert NotUpgrader();
        }
    }
}
