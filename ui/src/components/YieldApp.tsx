import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import {
  CYIELD_ABI,
  CYIELD_ADDRESS,
  SILENT_YIELD_ABI,
  SILENT_YIELD_ADDRESS,
} from '../config/contracts';
import '../styles/YieldApp.css';

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const WEI_PER_ETH = 10n ** 18n;
const YIELD_PER_DAY_PER_ETH = 10n * 10n ** 6n;
const SECONDS_PER_DAY = 86400n;

const trimDecimals = (value: string, maxDecimals: number) => {
  if (!value.includes('.')) return value;
  const [whole, fraction] = value.split('.');
  const trimmed = fraction.slice(0, maxDecimals);
  return trimmed ? `${whole}.${trimmed}` : whole;
};

export function YieldApp() {
  const { address } = useAccount();
  const chainId = useChainId();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [stakeInput, setStakeInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [encryptedStake, setEncryptedStake] = useState<string | null>(null);
  const [encryptedYield, setEncryptedYield] = useState<string | null>(null);
  const [lastAccrual, setLastAccrual] = useState<number | null>(null);
  const [decryptedStake, setDecryptedStake] = useState<bigint | null>(null);
  const [decryptedYield, setDecryptedYield] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [now, setNow] = useState(Date.now());

  const handleRefresh = () => setRefreshCounter((prev) => prev + 1);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      if (!address) {
        setEncryptedStake(null);
        setEncryptedYield(null);
        setLastAccrual(null);
        setDecryptedStake(null);
        setDecryptedYield(null);
        return;
      }

      setIsFetching(true);
      try {
        const [stakeHandle, accrual, yieldHandle] = await Promise.all([
          publicClient.readContract({
            address: SILENT_YIELD_ADDRESS,
            abi: SILENT_YIELD_ABI,
            functionName: 'encryptedStakeOf',
            args: [address],
          }),
          publicClient.readContract({
            address: SILENT_YIELD_ADDRESS,
            abi: SILENT_YIELD_ABI,
            functionName: 'lastAccrualAt',
            args: [address],
          }),
          publicClient.readContract({
            address: CYIELD_ADDRESS,
            abi: CYIELD_ABI,
            functionName: 'confidentialBalanceOf',
            args: [address],
          }),
        ]);

        if (!active) return;

        setEncryptedStake(stakeHandle as string);
        setLastAccrual(Number(accrual));
        setEncryptedYield(yieldHandle as string);
      } catch (error) {
        console.error('Failed to fetch on-chain data:', error);
      } finally {
        if (active) {
          setIsFetching(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [address, refreshCounter]);

  const estimatedYield = useMemo(() => {
    if (decryptedStake === null || lastAccrual === null) return null;
    const elapsed = BigInt(Math.max(0, Math.floor(now / 1000) - lastAccrual));
    if (elapsed === 0n) return 0n;
    return (decryptedStake * YIELD_PER_DAY_PER_ETH * elapsed) / (WEI_PER_ETH * SECONDS_PER_DAY);
  }, [decryptedStake, lastAccrual, now]);

  const formattedStake =
    decryptedStake === null ? '--' : trimDecimals(ethers.formatEther(decryptedStake), 4);
  const formattedYield =
    decryptedYield === null ? '--' : trimDecimals(ethers.formatUnits(decryptedYield, 6), 3);
  const formattedEstimatedYield =
    estimatedYield !== null ? trimDecimals(ethers.formatUnits(estimatedYield, 6), 3) : '--';

  const runTransaction = async (action: (contract: Contract) => Promise<any>, label: string) => {
    if (!signerPromise || !address) {
      setStatusMessage('Connect your wallet to continue.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatusMessage('Wallet signer unavailable.');
      return;
    }

    const contract = new Contract(SILENT_YIELD_ADDRESS, SILENT_YIELD_ABI, signer);
    setStatusMessage(`${label} submitted...`);

    try {
      const tx = await action(contract);
      await tx.wait();
      setStatusMessage(`${label} confirmed.`);
      handleRefresh();
    } catch (error) {
      console.error(`${label} failed:`, error);
      setStatusMessage(`${label} failed. Check the console for details.`);
    }
  };

  const handleStake = async () => {
    setIsStaking(true);
    try {
      const amount = ethers.parseEther(stakeInput || '0');
      if (amount <= 0n) {
        setStatusMessage('Enter a stake amount greater than 0.');
        return;
      }

      await runTransaction((contract) => contract.stake({ value: amount }), 'Stake');
      setStakeInput('');
    } catch (error) {
      console.error('Stake input invalid:', error);
      setStatusMessage('Enter a valid ETH amount.');
    } finally {
      setIsStaking(false);
    }
  };

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      const amount = ethers.parseEther(withdrawInput || '0');
      if (amount <= 0n) {
        setStatusMessage('Enter a withdraw amount greater than 0.');
        return;
      }

      await runTransaction((contract) => contract.withdraw(amount), 'Withdraw');
      setWithdrawInput('');
    } catch (error) {
      console.error('Withdraw input invalid:', error);
      setStatusMessage('Enter a valid ETH amount.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      await runTransaction((contract) => contract.claimYield(), 'Claim yield');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleDecrypt = async () => {
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Connect your wallet and load Zama before decrypting.');
      return;
    }

    const stakeHandle = encryptedStake && encryptedStake !== ZERO_HANDLE ? encryptedStake : null;
    const yieldHandle = encryptedYield && encryptedYield !== ZERO_HANDLE ? encryptedYield : null;

    if (!stakeHandle && !yieldHandle) {
      setDecryptedStake(0n);
      setDecryptedYield(0n);
      return;
    }

    setIsDecrypting(true);
    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs: { handle: string; contractAddress: string }[] = [];
      const contractAddresses: string[] = [];

      if (stakeHandle) {
        handleContractPairs.push({ handle: stakeHandle, contractAddress: SILENT_YIELD_ADDRESS });
        contractAddresses.push(SILENT_YIELD_ADDRESS);
      }

      if (yieldHandle) {
        handleContractPairs.push({ handle: yieldHandle, contractAddress: CYIELD_ADDRESS });
        contractAddresses.push(CYIELD_ADDRESS);
      }

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays,
      );

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      if (stakeHandle) {
        const stakeValue = result[stakeHandle] ?? '0';
        setDecryptedStake(BigInt(stakeValue));
      }

      if (yieldHandle) {
        const yieldValue = result[yieldHandle] ?? '0';
        setDecryptedYield(BigInt(yieldValue));
      }

      setStatusMessage('Decryption complete.');
    } catch (error) {
      console.error('Decryption failed:', error);
      setStatusMessage('Decryption failed. Try again.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const lastAccrualLabel = lastAccrual
    ? new Date(lastAccrual * 1000).toLocaleString()
    : 'Not available';

  return (
    <div className="yield-app">
      <Header />
      <main className="yield-main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Confidential staking</p>
            <h2>Stake ETH, earn encrypted yield, withdraw anytime.</h2>
            <p className="hero-subtitle">
              Silent Yield keeps your principal private with Zama FHE and mints cYieldCoin
              interest at 10 tokens per day for every 1 ETH staked.
            </p>
            <div className="hero-badges">
              <span>FHE encrypted</span>
              <span>10 cYieldCoin / ETH / day</span>
              <span>Sepolia ready</span>
            </div>
          </div>
          <div className="hero-panel">
            <div className="hero-panel-inner">
              <p className="panel-label">Wallet status</p>
              <p className="panel-value">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
              </p>
              <p className="panel-meta">
                Network: {chainId === sepolia.id ? 'Sepolia' : 'Wrong network'}
              </p>
              <div className="panel-divider" />
              <p className="panel-label">Encryption service</p>
              <p className="panel-meta">
                {zamaLoading ? 'Loading Zama relayer...' : zamaError ? zamaError : 'Ready'}
              </p>
              <button
                className="secondary-button"
                onClick={handleDecrypt}
                disabled={isDecrypting || !address || zamaLoading}
              >
                {isDecrypting ? 'Decrypting...' : 'Decrypt balances'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid">
          <div className="panel card">
            <div className="panel-header">
              <h3>Position overview</h3>
              <button className="ghost-button" onClick={handleRefresh} disabled={isFetching}>
                {isFetching ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="stat-list">
              <div className="stat-item">
                <span>Encrypted stake</span>
                <strong>{formattedStake} ETH</strong>
              </div>
              <div className="stat-item">
                <span>cYieldCoin balance</span>
                <strong>{formattedYield}</strong>
              </div>
              <div className="stat-item">
                <span>Estimated yield</span>
                <strong>{formattedEstimatedYield}</strong>
              </div>
              <div className="stat-item">
                <span>Last accrual</span>
                <strong>{lastAccrualLabel}</strong>
              </div>
            </div>
            <p className="panel-note">
              Balances stay encrypted on-chain. Decrypt locally with your wallet signature to reveal them.
            </p>
          </div>

          <div className="panel card">
            <div className="panel-header">
              <h3>Actions</h3>
              <span className="panel-meta">Manage your stake and yield</span>
            </div>
            <div className="action-block">
              <label htmlFor="stake" className="input-label">Stake ETH</label>
              <div className="input-row">
                <input
                  id="stake"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={stakeInput}
                  onChange={(event) => setStakeInput(event.target.value)}
                />
                <button
                  className="primary-button"
                  onClick={handleStake}
                  disabled={isStaking || !address}
                >
                  {isStaking ? 'Staking...' : 'Stake'}
                </button>
              </div>
            </div>

            <div className="action-block">
              <label htmlFor="withdraw" className="input-label">Withdraw ETH</label>
              <div className="input-row">
                <input
                  id="withdraw"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={withdrawInput}
                  onChange={(event) => setWithdrawInput(event.target.value)}
                />
                <button
                  className="secondary-button"
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || !address}
                >
                  {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                </button>
              </div>
            </div>

            <div className="action-footer">
              <button
                className="ghost-button"
                onClick={handleClaim}
                disabled={isClaiming || !address}
              >
                {isClaiming ? 'Claiming...' : 'Claim yield'}
              </button>
              <span className="status-text">{statusMessage}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
