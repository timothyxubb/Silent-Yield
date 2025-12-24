// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ConfidentialYieldCoin} from "./ConfidentialYieldCoin.sol";

contract SilentYield is ZamaEthereumConfig {
    struct Position {
        euint128 encryptedPrincipal;
        uint128 principalWei;
        uint256 lastAccrual;
    }

    uint64 public constant YIELD_PER_DAY_PER_ETH = 10 * 1e6;
    uint64 public constant SECONDS_PER_DAY = 1 days;
    uint64 public constant WEI_PER_ETH = 1e18;

    ConfidentialYieldCoin public immutable yieldToken;

    mapping(address => Position) private _positions;

    error ZeroAmount();
    error AmountTooLarge();
    error InsufficientStake();

    event Staked(address indexed account, uint256 amountWei);
    event Withdrawn(address indexed account, uint256 amountWei);
    event YieldClaimed(address indexed account, uint256 timestamp);

    constructor(address token) {
        require(token != address(0), "Token required");
        yieldToken = ConfidentialYieldCoin(token);
    }

    function stake() external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (msg.value > type(uint128).max) revert AmountTooLarge();

        Position storage position = _accrue(msg.sender);

        uint128 amount = uint128(msg.value);
        position.principalWei += amount;
        position.encryptedPrincipal = FHE.add(position.encryptedPrincipal, amount);
        FHE.allowThis(position.encryptedPrincipal);
        FHE.allow(position.encryptedPrincipal, msg.sender);

        position.lastAccrual = block.timestamp;
        emit Staked(msg.sender, msg.value);
    }

    function claimYield() external {
        _accrue(msg.sender);
        emit YieldClaimed(msg.sender, block.timestamp);
    }

    function withdraw(uint256 amountWei) external {
        if (amountWei == 0) revert ZeroAmount();
        if (amountWei > type(uint128).max) revert AmountTooLarge();

        Position storage position = _accrue(msg.sender);

        uint128 amount = uint128(amountWei);
        if (position.principalWei < amount) revert InsufficientStake();

        position.principalWei -= amount;
        position.encryptedPrincipal = FHE.sub(position.encryptedPrincipal, amount);
        FHE.allowThis(position.encryptedPrincipal);
        FHE.allow(position.encryptedPrincipal, msg.sender);

        position.lastAccrual = block.timestamp;

        payable(msg.sender).transfer(amountWei);
        emit Withdrawn(msg.sender, amountWei);
    }

    function encryptedStakeOf(address account) external view returns (euint128) {
        return _positions[account].encryptedPrincipal;
    }

    function lastAccrualAt(address account) external view returns (uint256) {
        return _positions[account].lastAccrual;
    }

    function _accrue(address account) internal returns (Position storage position) {
        position = _positions[account];
        uint256 lastAccrual = position.lastAccrual;

        if (position.principalWei == 0) {
            position.lastAccrual = block.timestamp;
            return position;
        }

        if (lastAccrual == 0) {
            position.lastAccrual = block.timestamp;
            return position;
        }

        uint256 elapsedSeconds = block.timestamp - lastAccrual;
        if (elapsedSeconds == 0) {
            return position;
        }

        euint64 yieldAmount = _calculateYield(position.encryptedPrincipal, elapsedSeconds);
        FHE.allowTransient(yieldAmount, address(yieldToken));
        yieldToken.mint(account, yieldAmount);
        position.lastAccrual = block.timestamp;
    }

    function _calculateYield(euint128 principalWei, uint256 elapsedSeconds) internal returns (euint64) {
        if (elapsedSeconds == 0) {
            return FHE.asEuint64(0);
        }

        uint128 elapsed = elapsedSeconds > type(uint128).max ? type(uint128).max : uint128(elapsedSeconds);
        euint128 scaled = FHE.mul(principalWei, uint128(YIELD_PER_DAY_PER_ETH));
        euint128 timeScaled = FHE.mul(scaled, elapsed);
        uint128 divisor = uint128(WEI_PER_ETH) * uint128(SECONDS_PER_DAY);
        euint128 yield128 = FHE.div(timeScaled, divisor);

        return FHE.asEuint64(yield128);
    }
}
