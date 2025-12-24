// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {euint64} from "@fhevm/solidity/lib/FHE.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ConfidentialYieldCoin is ERC7984, ZamaEthereumConfig, Ownable {
    address public minter;

    error UnauthorizedMinter(address caller);

    event MinterUpdated(address indexed newMinter);

    constructor(address initialOwner) ERC7984("cYieldCoin", "cYieldCoin", "") Ownable(initialOwner) {}

    modifier onlyMinter() {
        if (msg.sender != minter) {
            revert UnauthorizedMinter(msg.sender);
        }
        _;
    }

    function setMinter(address newMinter) external onlyOwner {
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function mint(address to, euint64 amount) external onlyMinter returns (euint64 minted) {
        minted = _mint(to, amount);
    }

    function burn(address from, euint64 amount) external onlyMinter returns (euint64 burned) {
        burned = _burn(from, amount);
    }
}
