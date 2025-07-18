'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI } from '../../basechat/PinnedJobs/config/contractConfig';
import { isUserAdmin } from '../../utils/firebase';
import { toast } from 'react-hot-toast';
import { formatEther, parseEther } from 'viem';

interface PinDetails {
  owner: string;
  postId: string;
  duration: number;
  paidAmount: bigint;
  expiresAt: bigint;
  isActive: boolean;
  createdAt: bigint;
}

export default function PaidPinsManagement() {
  const { address } = useAccount();
  const [adminPinIds, setAdminPinIds] = useState<string[]>([]);
  const [selectedPin, setSelectedPin] = useState<string>('');
  const [pinDetails, setPinDetails] = useState<PinDetails | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const { writeContract, isPending } = useWriteContract();

  // Read contract balance
  const { data: contractBalance } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getBalance',
  });

  // Read total revenue
  const { data: totalRevenue } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'totalRevenue',
  });

  // Read total pins created
  const { data: totalPins } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getTotalPins',
  });

  // Read contract pause status
  const { data: isPaused } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'paused',
  });

  // Read current prices
  const { data: price1h } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getPrice',
    args: [0], // HOUR_1
  });

  const { data: price6h } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getPrice',
    args: [1], // HOURS_6
  });

  const { data: price24h } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getPrice',
    args: [2], // HOURS_24
  });

  const { data: price7d } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getPrice',
    args: [3], // DAYS_7
  });

  const isAdmin = address && isUserAdmin(address);

  if (!isAdmin) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-bold text-red-800 mb-2">🚫 Access Denied</h2>
        <p className="text-red-700">Only admins can access paid pins management.</p>
      </div>
    );
  }

  const handleGetPinDetails = async () => {
    if (!selectedPin) return;

    try {
      const details = await writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'getPinDetails',
        args: [selectedPin],
      });
      // Note: This would need proper handling for read operations
      console.log('Pin details:', details);
    } catch (error) {
      console.error('Error getting pin details:', error);
      toast.error('Failed to get pin details');
    }
  };

  const handleUpdatePrice = async () => {
    if (!newPrice || selectedDuration === null) return;

    try {
      await writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'updatePrice',
        args: [selectedDuration, parseEther(newPrice)],
      });
      toast.success('Price updated successfully!');
      setNewPrice('');
    } catch (error) {
      console.error('Error updating price:', error);
      toast.error('Failed to update price');
    }
  };

  const handleWithdrawRevenue = async () => {
    if (!withdrawAmount) return;

    try {
      await writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'withdrawRevenue',
        args: [parseEther(withdrawAmount)],
      });
      toast.success('Revenue withdrawn successfully!');
      setWithdrawAmount('');
    } catch (error) {
      console.error('Error withdrawing revenue:', error);
      toast.error('Failed to withdraw revenue');
    }
  };

  const handlePauseContract = async () => {
    try {
      await writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'pause',
      });
      toast.success('Contract paused!');
    } catch (error) {
      console.error('Error pausing contract:', error);
      toast.error('Failed to pause contract');
    }
  };

  const handleUnpauseContract = async () => {
    try {
      await writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'unpause',
      });
      toast.success('Contract unpaused!');
    } catch (error) {
      console.error('Error unpausing contract:', error);
      toast.error('Failed to unpause contract');
    }
  };

  const handleEmergencyDeactivate = async () => {
    if (!selectedPin) return;

    if (!confirm(`Are you sure you want to emergency deactivate pin: ${selectedPin}?`)) {
      return;
    }

    try {
      await writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'emergencyDeactivatePin',
        args: [selectedPin],
      });
      toast.success('Pin deactivated!');
      setSelectedPin('');
    } catch (error) {
      console.error('Error deactivating pin:', error);
      toast.error('Failed to deactivate pin');
    }
  };

  const durationNames = ['1 Hour', '6 Hours', '24 Hours', '7 Days'];
  const currentPrices = [price1h, price6h, price24h, price7d];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-6 rounded-xl">
        <h2 className="text-2xl font-bold mb-2">💰 Paid Pins Contract Management</h2>
        <p className="text-yellow-100">Full admin control over smart contract functions</p>
      </div>

      {/* Contract Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800">Total Revenue</h3>
          <p className="text-2xl font-bold text-blue-600">
            {totalRevenue ? formatEther(totalRevenue as bigint) : '0'} ETH
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="font-semibold text-green-800">Contract Balance</h3>
          <p className="text-2xl font-bold text-green-600">
            {contractBalance ? formatEther(contractBalance as bigint) : '0'} ETH
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <h3 className="font-semibold text-purple-800">Total Pins Created</h3>
          <p className="text-2xl font-bold text-purple-600">
            {totalPins ? totalPins.toString() : '0'}
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-800">Contract Status</h3>
          <p className={`text-2xl font-bold ${isPaused ? 'text-red-600' : 'text-green-600'}`}>
            {isPaused ? '⏸️ Paused' : '▶️ Active'}
          </p>
        </div>
      </div>

      {/* Current Prices */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">📊 Current Prices</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {currentPrices.map((price, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded border">
              <div className="font-medium">{durationNames[index]}</div>
              <div className="text-lg font-bold text-blue-600">
                {price ? formatEther(price as bigint) : '0'} ETH
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Management */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">💰 Update Prices</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Duration</label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(Number(e.target.value))}
              className="w-full p-2 border rounded"
            >
              {durationNames.map((name, index) => (
                <option key={index} value={index}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">New Price (ETH)</label>
            <input
              type="number"
              step="0.001"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="0.005"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleUpdatePrice}
              disabled={isPending || !newPrice}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isPending ? 'Updating...' : 'Update Price'}
            </button>
          </div>
        </div>
      </div>

      {/* Revenue Management */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">💸 Withdraw Revenue</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Amount (ETH)</label>
            <input
              type="number"
              step="0.001"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="0.1"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleWithdrawRevenue}
              disabled={isPending || !withdrawAmount}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isPending ? 'Withdrawing...' : 'Withdraw Revenue'}
            </button>
          </div>
        </div>
      </div>

      {/* Emergency Controls */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">🚨 Emergency Controls</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Pin ID to Deactivate</label>
            <input
              type="text"
              value={selectedPin}
              onChange={(e) => setSelectedPin(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="post-id-123"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleEmergencyDeactivate}
              disabled={isPending || !selectedPin}
              className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {isPending ? 'Deactivating...' : 'Emergency Deactivate'}
            </button>
          </div>
          <div className="flex items-end">
            {isPaused ? (
              <button
                onClick={handleUnpauseContract}
                disabled={isPending}
                className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                {isPending ? 'Unpausing...' : '▶️ Unpause Contract'}
              </button>
            ) : (
              <button
                onClick={handlePauseContract}
                disabled={isPending}
                className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
              >
                {isPending ? 'Pausing...' : '⏸️ Pause Contract'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contract Info */}
      <div className="bg-gray-50 p-4 rounded-lg border">
        <h3 className="font-semibold mb-2">📜 Contract Information</h3>
        <div className="text-sm space-y-1">
          <p><strong>Address:</strong> {PAID_PIN_CONTRACT_CONFIG.address}</p>
          <p><strong>Network:</strong> Base Mainnet (Chain ID: {PAID_PIN_CONTRACT_CONFIG.chainId})</p>
          <p><strong>Explorer:</strong> 
            <a 
              href={`${PAID_PIN_CONTRACT_CONFIG.blockExplorer}/address/${PAID_PIN_CONTRACT_CONFIG.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline ml-1"
            >
              View on Basescan
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 