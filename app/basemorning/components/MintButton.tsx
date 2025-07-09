import React, { useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { useBaseMorningContract } from '../hooks/useBaseMorningContract';
import styles from './MintButton.module.css';

const MintButton: React.FC = () => {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const { mintElement, getMintPrice, isLoading } = useBaseMorningContract();
  const [mintPrice, setMintPrice] = useState<bigint>(BigInt(0));
  const [isMinting, setIsMinting] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getMintPrice();
      setMintPrice(price);
    };
    fetchPrice();
  }, [getMintPrice]);

  const handleMint = async () => {
    if (!address || !balance) return;
    
    // Check if user has enough balance
    if (balance.value < mintPrice) {
      alert('Insufficient balance to mint element');
      return;
    }

    setIsMinting(true);
    try {
      await mintElement();
      alert('Element minted successfully! 🎉');
    } catch (error: any) {
      console.error('Minting failed:', error);
      alert(`Minting failed: ${error.message}`);
    } finally {
      setIsMinting(false);
    }
  };

  const canMint = balance && balance.value >= mintPrice;

  return (
    <div className={styles.mintButtonContainer}>
      <div className={styles.mintInfo}>
        <h3>Mint New Element</h3>
        <p className={styles.price}>Price: {formatEther(mintPrice)} ETH</p>
        <p className={styles.balance}>
          Your Balance: {balance ? formatEther(balance.value) : '0'} ETH
        </p>
      </div>
      
      <button
        onClick={handleMint}
        disabled={!canMint || isLoading || isMinting}
        className={`${styles.mintButton} ${canMint ? styles.enabled : styles.disabled}`}
      >
        {isMinting ? (
          <>
            <span className={styles.spinner}></span>
            Minting...
          </>
        ) : (
          <>
            ⚡ Mint Element
          </>
        )}
      </button>
      
      {!canMint && balance && (
        <p className={styles.warning}>
          ⚠️ Insufficient balance. You need {formatEther(mintPrice)} ETH to mint.
        </p>
      )}
    </div>
  );
};

export default MintButton; 