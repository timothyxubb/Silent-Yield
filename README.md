# Silent Yield

Silent Yield is a confidential ETH staking and yield accrual protocol built on Zama FHEVM. Users stake ETH, the
principal is stored on-chain as Fully Homomorphic Encryption (FHE) data, and yield is minted as a confidential
ERC7984 token called cYieldCoin. The yield rate is fixed at 10 cYieldCoin per 1 ETH per day, accrued linearly per
second. Users can claim yield at any time and withdraw principal without lockups.

## Project Goals

- Protect staking balances and strategies from public exposure.
- Provide a simple, deterministic yield model for privacy-first applications.
- Demonstrate how FHE can preserve confidentiality while maintaining transparent ETH transfers.

## Problems Solved

- Public staking positions reveal wallet size and behavior. Silent Yield encrypts the principal on-chain.
- Conventional yield systems leak strategy timing. Silent Yield accrues yield without exposing principal.
- Confidential tokens are hard to integrate. cYieldCoin is minted directly from the protocol using FHE.

## Key Advantages

- Confidential principal: the stake is stored as encrypted data using FHE.
- Deterministic yield: a fixed and auditable rate with per-second linear accrual.
- Non-custodial flow: users always control withdrawals and claims.
- Confidential yield token: cYieldCoin uses ERC7984 for encrypted balances.
- Explicit view methods: read-only functions take an address parameter and avoid implicit msg.sender usage.

## How It Works

1. Stake ETH with `stake()` and the principal is added to an encrypted balance.
2. Yield accrues over time using the encrypted principal and elapsed seconds.
3. `claimYield()` mints confidential cYieldCoin to the caller using FHE.
4. `withdraw(amount)` reduces the encrypted principal and transfers ETH back to the user.

### Yield Formula

The contract uses an on-chain linear formula:

```
yield = principalWei * YIELD_PER_DAY_PER_ETH * elapsedSeconds / (1e18 * 1 days)
```

Where `YIELD_PER_DAY_PER_ETH` is `10 * 1e6`, representing 10 cYieldCoin per ETH per day.

## Smart Contracts

- `SilentYield.sol`: Manages staking, accrual, and ETH withdrawals.
- `ConfidentialYieldCoin.sol`: Confidential ERC7984 token minted by SilentYield.

The deploy script assigns SilentYield as the minter for cYieldCoin and prints deployed addresses.

## Tech Stack

- Solidity 0.8.27 with Zama FHEVM
- Hardhat + hardhat-deploy + TypeScript
- @fhevm/solidity and @fhevm/hardhat-plugin
- OpenZeppelin Confidential Contracts (ERC7984)
- Frontend: React + Vite + RainbowKit, viem for reads and ethers for writes
- Node.js 20+

## Repository Structure

```
contracts/          Smart contracts
deploy/             Deployment scripts
tasks/              Hardhat tasks for stake/claim/withdraw/decrypt
test/               Contract tests
ui/                 Frontend (React + Vite)
docs/               Project and Zama references
```

## Setup

### Prerequisites

- Node.js 20+
- npm

### Install Dependencies

```
npm install
cd ui
npm install
```

### Environment Variables (Hardhat Only)

Create a `.env` file at the project root:

```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional_etherscan_key
```

Notes:
- Deployments use `PRIVATE_KEY`, not mnemonic phrases.
- The frontend does not rely on environment variables.

## Compile and Test

```
npm run compile
npm run test
```

## Local Development Workflow

1. Start a local node:

```
npx hardhat node
```

2. Deploy contracts:

```
npx hardhat --network localhost deploy
```

3. Interact with tasks:

```
npx hardhat --network localhost task:address
npx hardhat --network localhost task:stake --amount 1
npx hardhat --network localhost task:claim-yield
npx hardhat --network localhost task:decrypt-stake
npx hardhat --network localhost task:decrypt-yield
npx hardhat --network localhost task:withdraw --amount 0.5
```

## Sepolia Deployment

```
npx hardhat --network sepolia deploy
npx hardhat --network sepolia task:address
npx hardhat --network sepolia task:stake --amount 0.1
```

To verify:

```
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Frontend Notes

- The frontend lives in `ui/` and is built with React + Vite.
- Contract reads use viem, and contract writes use ethers.
- Wallet connection uses RainbowKit.
- ABI files must be copied from `deployments/sepolia` after deployment.
- The frontend targets Sepolia; do not configure a localhost chain.
- All data is sourced from live contracts; no mock data is used.
- The frontend avoids local storage for state persistence.

## Privacy and Security Model

- The encrypted principal is only decryptable by the user and contract.
- cYieldCoin balances are confidential via ERC7984.
- ETH transfers are visible on-chain; the privacy scope applies to stored principal and yield token balances.
- SilentYield is the only minter and burner for cYieldCoin.

## Limitations

- Fixed yield rate; no dynamic interest model yet.
- Yield accrues on interaction (stake/claim/withdraw), not automatically.
- Single-asset staking (ETH only).

## Future Plans

- Variable rate modules and configurable yield curves.
- Optional auto-compounding into confidential balances.
- Multi-asset staking and vault-based strategies.
- Audit-ready security reviews and formal verification.
- Richer UI analytics without exposing private balances.
- Governance for rate updates and risk parameters.
- Cross-chain deployment for additional testnets.

## Documentation

- Zama FHEVM docs: `docs/zama_llm.md`
- Frontend relayer guidance: `docs/zama_doc_relayer.md`

## License

BSD-3-Clause-Clear. See `LICENSE`.
