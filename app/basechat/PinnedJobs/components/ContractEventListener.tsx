'use client';

import { useEffect } from 'react';
import { useWatchContractEvent } from 'wagmi';
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI } from '../config/contractConfig';
import { createPaidPin } from '../../../utils/firebase';
import { toast } from 'react-hot-toast';

interface ContractEventListenerProps {
  onPinCreated?: () => void; // Callback to refresh feed
  onPinConfirmed?: (postId: string) => void; // Callback to remove pending state
}

export default function ContractEventListener({ onPinCreated, onPinConfirmed }: ContractEventListenerProps) {
  
  // Listen for PinCreated events from contract
  useWatchContractEvent({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    eventName: 'PinCreated',
    onLogs(logs) {
      console.log('🎉 PinCreated event detected:', logs);
      
      logs.forEach(async (log: any) => {
        try {
          const args = log.args;
          const transactionHash = log.transactionHash;
          
          if (args && transactionHash) {
            const [owner, postId, duration, amount, expiresAt] = args as [
              string, 
              string, 
              number, 
              bigint, 
              bigint
            ];

            console.log('📌 Processing PinCreated event:', {
              owner,
              postId,
              duration,
              amount: amount.toString(),
              expiresAt: expiresAt.toString(),
              txHash: transactionHash
            });

            // Map contract duration enum to our duration type
            const durationMapping = ['HOUR_1', 'HOURS_6', 'HOURS_24', 'DAYS_7'] as const;
            const mappedDuration = durationMapping[duration] || 'HOURS_24';

            // Save to Firebase (this will update the post)
            const success = await createPaidPin(
              postId,
              owner,
              mappedDuration,
              transactionHash,
              (Number(amount) / 1e18).toString() // Convert from wei to ETH
            );

            if (success) {
              console.log('✅ Pin data saved to Firebase successfully');
              
              // Show success notification
              toast.success(`📌 Post pinned for ${mappedDuration.replace('_', ' ').toLowerCase()}!`, {
                duration: 5000,
                icon: '🎉',
              });
              
              // Remove pending state for this post
              if (onPinConfirmed) {
                onPinConfirmed(postId);
              }
              
              // Trigger feed refresh
              if (onPinCreated) {
                onPinCreated();
              }
            } else {
              console.error('❌ Failed to save pin data to Firebase');
              toast.error('Pin detected but failed to save data');
            }
          }
        } catch (error) {
          console.error('❌ Error processing PinCreated event:', error);
          toast.error('Error processing pin event');
        }
      });
    },
    // Only listen if contract address is set
    enabled: PAID_PIN_CONTRACT_CONFIG.address !== "YOUR_CONTRACT_ADDRESS"
  });

  // Listen for PinExpired events
  useWatchContractEvent({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    eventName: 'PinExpired',
    onLogs(logs) {
      console.log('⏰ PinExpired event detected:', logs);
      
      logs.forEach((log: any) => {
        const args = log.args;
        if (args) {
          const [postId, owner] = args as [string, string];
          console.log(`📌 Pin expired for post ${postId} by ${owner}`);
          
          // Trigger feed refresh to remove expired pin
          if (onPinCreated) {
            onPinCreated();
          }
        }
      });
    },
    enabled: PAID_PIN_CONTRACT_CONFIG.address !== "YOUR_CONTRACT_ADDRESS"
  });

  return null; // This is a utility component, no UI
} 