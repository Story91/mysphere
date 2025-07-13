'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import StepIndicator from './StepIndicator';
import BasicInfoStep from './BasicInfoStep';
import PricingStep from './PricingStep';
import PreviewStep from './PreviewStep';
import SuccessStep from './SuccessStep';

interface CommunityFormData {
  name: string;
  description: string;
  category: string;
  tags: string[];
  joinFee: string;
  monthlyFee: string;
  lifetimeFee: string;
  terms: string;
  rules: string[];
  isPublic: boolean;
  autoApprove: boolean;
  allowReferrals: boolean;
}

export default function CreateCommunityForm() {
  const { address, isConnected } = useAccount();
  const { createCommunity, creationFee, isLoading, parseEther } = useSpheresContract();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [createdCommunityId, setCreatedCommunityId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState<CommunityFormData>({
    name: '',
    description: '',
    category: '',
    tags: [],
    joinFee: '0.001',
    monthlyFee: '0.005',
    lifetimeFee: '0.05',
    terms: '',
    rules: [],
    isPublic: true,
    autoApprove: true,
    allowReferrals: true
  });

  const [errors, setErrors] = useState<Partial<CommunityFormData>>({});

  const steps = [
    { id: 1, title: 'Basic Info', description: 'Name and description' },
    { id: 2, title: 'Pricing', description: 'Set membership fees' },
    { id: 3, title: 'Preview', description: 'Review and confirm' },
    { id: 4, title: 'Success', description: 'Community created!' }
  ];

  // Walidacja formularza
  const validateStep = (step: number): boolean => {
    const newErrors: Partial<CommunityFormData> = {};
    let isValid = true;

    switch (step) {
      case 1:
        if (!formData.name.trim()) {
          newErrors.name = 'Community name is required';
          isValid = false;
        } else if (formData.name.length < 3) {
          newErrors.name = 'Community name must be at least 3 characters';
          isValid = false;
        }
        
        if (!formData.description.trim()) {
          newErrors.description = 'Description is required';
          isValid = false;
        } else if (formData.description.length < 10) {
          newErrors.description = 'Description must be at least 10 characters';
          isValid = false;
        }
        
        if (!formData.category) {
          newErrors.category = 'Please select a category';
          isValid = false;
        }
        break;
        
      case 2:
        if (!formData.joinFee || parseFloat(formData.joinFee) < 0) {
          newErrors.joinFee = 'Join fee must be 0 or greater';
          isValid = false;
        }
        
        if (!formData.monthlyFee || parseFloat(formData.monthlyFee) < 0) {
          newErrors.monthlyFee = 'Monthly fee must be 0 or greater';
          isValid = false;
        }
        
        if (!formData.lifetimeFee || parseFloat(formData.lifetimeFee) < 0) {
          newErrors.lifetimeFee = 'Lifetime fee must be 0 or greater';
          isValid = false;
        }
        
        // Walidacja logiki cenowej
        if (parseFloat(formData.lifetimeFee) <= parseFloat(formData.monthlyFee) * 2) {
          newErrors.lifetimeFee = 'Lifetime fee should be at least 2x monthly fee';
          isValid = false;
        }
        break;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(2)) return;
    
    setIsCreating(true);
    try {
      // Przygotowanie danych do kontraktu
      await createCommunity(
        formData.name,
        formData.description,
        parseEther(formData.joinFee),
        parseEther(formData.monthlyFee),
        parseEther(formData.lifetimeFee)
      );
      
      setCreatedCommunityId(1); // Temporary ID - in real app would be returned from contract
      setCurrentStep(4);
      toast.success('Community created successfully! 🎉');
      
    } catch (error: any) {
      console.error('Error creating community:', error);
      toast.error(`Failed to create community: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const updateFormData = (updates: Partial<CommunityFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    // Wyczyść błędy dla zaktualizowanych pól
    const updatedErrors = { ...errors };
    Object.keys(updates).forEach(key => {
      delete updatedErrors[key as keyof CommunityFormData];
    });
    setErrors(updatedErrors);
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Wallet Required</h2>
          <p className="text-gray-400">
            Please connect your wallet to create a community.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Create Your Community 🏘️</h1>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Build a thriving community with membership fees, events, and rewards. 
          Start monetizing your expertise today!
        </p>
      </motion.div>

      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} steps={steps} />

      {/* Form Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10"
      >
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <BasicInfoStep
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
            />
          )}
          
          {currentStep === 2 && (
            <PricingStep
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
              creationFee={creationFee}
            />
          )}
          
          {currentStep === 3 && (
            <PreviewStep
              formData={formData}
              creationFee={creationFee}
              isCreating={isCreating}
              onSubmit={handleSubmit}
            />
          )}
          
          {currentStep === 4 && (
            <SuccessStep
              communityId={createdCommunityId}
              communityName={formData.name}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Navigation */}
      {currentStep < 4 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center"
        >
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              currentStep === 1
                ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            Back
          </button>

          <div className="flex items-center space-x-4">
            {currentStep < 3 && (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-semibold transition-all"
              >
                Continue
              </button>
            )}
            
            {currentStep === 3 && (
              <button
                onClick={handleSubmit}
                disabled={isCreating}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  isCreating
                    ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white'
                }`}
              >
                {isCreating ? 'Creating...' : 'Create Community'}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Cost Summary */}
      {currentStep < 4 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-500/20"
        >
          <h3 className="text-lg font-semibold text-white mb-3">💰 Cost Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Platform Creation Fee</span>
              <span className="text-white font-semibold">{creationFee || '0.01'} ETH</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Transaction Fee</span>
              <span className="text-white font-semibold">~0.5%</span>
            </div>
            <div className="border-t border-white/10 pt-2 mt-2">
              <div className="flex justify-between items-center font-semibold">
                <span className="text-white">Total Cost</span>
                <span className="text-green-400">{creationFee || '0.01'} ETH + Gas</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
} 