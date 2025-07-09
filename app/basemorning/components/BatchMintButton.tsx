import React, { useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { useBaseMorningContract } from '../hooks/useBaseMorningContract';
import { motion } from 'framer-motion';
import { Plus, Minus, Zap, Package } from 'lucide-react';
import styles from './MintButton.module.css';

const BatchMintButton: React.FC = () => {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const { 
    mintElements, 
    calculateBatchPrice, 
    getDiscountPercent, 
    getMintPrice, 
    isLoading 
  } = useBaseMorningContract();
  const [mintPrice, setMintPrice] = useState<bigint>(BigInt(0));
  const [batchPrice, setBatchPrice] = useState<bigint>(BigInt(0));
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [isMinting, setIsMinting] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getMintPrice();
      setMintPrice(price);
    };
    fetchPrice();
  }, [getMintPrice]);

  useEffect(() => {
    const fetchBatchPricing = async () => {
      const price = await calculateBatchPrice(quantity);
      const discount = await getDiscountPercent(quantity);
      setBatchPrice(price);
      setDiscountPercent(discount);
    };
    fetchBatchPricing();
  }, [quantity, calculateBatchPrice, getDiscountPercent]);

  const totalCost = mintPrice * BigInt(quantity);
  const finalPrice = batchPrice;
  const savings = totalCost - finalPrice;
  const canMint = balance && balance.value >= finalPrice;

  const handleQuantityChange = (change: number) => {
    const newQuantity = Math.max(1, Math.min(20, quantity + change));
    setQuantity(newQuantity);
  };

  const handleBatchMint = async () => {
    if (!address || !balance || !canMint) return;

    setIsMinting(true);
    try {
      // Use smart contract batch minting with automatic discounts
      await mintElements(quantity);
      alert(`Successfully minted ${quantity} elements with ${discountPercent}% discount! 🎉`);
    } catch (error: any) {
      console.error('Batch minting failed:', error);
      alert(`Batch minting failed: ${error.message}`);
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 rounded-lg bg-purple-500/20">
          <Package className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-purple-300">Batch Mint Elements</h3>
          <p className="text-sm text-gray-400">Mint multiple elements with bulk discounts</p>
        </div>
      </div>

      {/* Quantity Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-purple-300 mb-3">
          Quantity (Max: 20)
        </label>
        <div className="flex items-center justify-center space-x-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleQuantityChange(-1)}
            disabled={quantity <= 1}
            className="w-12 h-12 rounded-full bg-purple-600/20 border border-purple-500/50 flex items-center justify-center text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Minus className="w-5 h-5" />
          </motion.button>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-white bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {quantity}
            </div>
            <div className="text-sm text-gray-400">Elements</div>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleQuantityChange(1)}
            disabled={quantity >= 20}
            className="w-12 h-12 rounded-full bg-purple-600/20 border border-purple-500/50 flex items-center justify-center text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* Quick Select Buttons */}
      <div className="flex justify-center space-x-2 mb-6">
        {[3, 5, 10, 20].map((num) => (
          <motion.button
            key={num}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setQuantity(num)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${quantity === num
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 border border-gray-600/50'
              }
            `}
          >
            {num}x
            {num >= 3 && (
              <span className="ml-1 text-xs text-green-400">
                -{num >= 10 ? 15 : num >= 5 ? 10 : 5}%
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* Pricing Information */}
      <div className="bg-gray-900/50 rounded-lg p-4 mb-6 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Unit Price:</span>
          <span className="text-white font-medium">{formatEther(mintPrice)} ETH</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Subtotal ({quantity}x):</span>
          <span className="text-white">{formatEther(totalCost)} ETH</span>
        </div>

        {discountPercent > 0 && (
          <>
            <div className="flex justify-between items-center text-green-400">
              <span>Bulk Discount ({discountPercent}%):</span>
              <span>-{formatEther(savings)} ETH</span>
            </div>
            <hr className="border-gray-600" />
          </>
        )}

        <div className="flex justify-between items-center text-lg font-bold">
          <span className="text-purple-300">Total Cost:</span>
          <span className="text-white">{formatEther(finalPrice)} ETH</span>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Your Balance:</span>
          <span className={`${canMint ? 'text-green-400' : 'text-red-400'}`}>
            {balance ? formatEther(balance.value) : '0'} ETH
          </span>
        </div>
      </div>

      {/* Discount Badge */}
      {discountPercent > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex items-center justify-center mb-4"
        >
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center space-x-2">
            <Zap className="w-4 h-4" />
            <span>Save {formatEther(savings)} ETH ({discountPercent}% OFF)</span>
          </div>
        </motion.div>
      )}

      {/* Mint Button */}
      <motion.button
        whileHover={canMint ? { scale: 1.02 } : {}}
        whileTap={canMint ? { scale: 0.98 } : {}}
        onClick={handleBatchMint}
        disabled={!canMint || isLoading || isMinting}
        className={`
          w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center space-x-3
          transition-all duration-300 relative overflow-hidden
          ${canMint && !isMinting
            ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg shadow-purple-600/25'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {isMinting ? (
          <>
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
            <span>Minting {quantity} Elements...</span>
          </>
        ) : (
          <>
            <Package className="w-6 h-6" />
            <span>Mint {quantity} Element{quantity > 1 ? 's' : ''}</span>
          </>
        )}
      </motion.button>

      {!canMint && balance && (
        <p className="text-red-400 text-sm text-center mt-3">
          ⚠️ Insufficient balance. You need {formatEther(finalPrice)} ETH.
        </p>
      )}
    </motion.div>
  );
};

export default BatchMintButton; 