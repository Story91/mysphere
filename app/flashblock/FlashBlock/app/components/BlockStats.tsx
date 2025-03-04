'use client';

import React, { useState, useEffect } from 'react';

interface BlockStatsProps {
  flashBlockCount?: number;
  standardBlockCount?: number;
  autoIncrement?: boolean;
}

const BlockStats: React.FC<BlockStatsProps> = ({
  flashBlockCount = 0,
  standardBlockCount = 0,
  autoIncrement = true
}) => {
  // Use state to track real counts since page load
  const [totalFlashBlocks, setTotalFlashBlocks] = useState(0);
  const [totalStandardBlocks, setTotalStandardBlocks] = useState(0);
  
  // Update total counts when props change
  useEffect(() => {
    if (flashBlockCount > 0) {
      setTotalFlashBlocks(flashBlockCount);
    }
  }, [flashBlockCount]);
  
  useEffect(() => {
    if (standardBlockCount > 0) {
      setTotalStandardBlocks(standardBlockCount);
    }
  }, [standardBlockCount]);
  
  // Auto increment blocks for demo purposes
  useEffect(() => {
    if (!autoIncrement) return;
    
    const blockInterval = setInterval(() => {
      // Add 1 standard block every 2 seconds
      setTotalStandardBlocks(prev => prev + 1);
      
      // Add 10 FlashBlocks every 2 seconds
      setTotalFlashBlocks(prev => prev + 10);
    }, 2000);
    
    return () => {
      clearInterval(blockInterval);
    };
  }, [autoIncrement]);
  
  // Total blocks is the sum of all standard blocks and flashblocks
  const totalBlocks = totalStandardBlocks + totalFlashBlocks;
  
  return (
    <div className="bg-gradient-to-br from-white via-blue-50 to-blue-100 rounded-xl p-6 shadow-lg border border-blue-200 mb-6">
      <h2 className="text-xl font-bold text-blue-600 mb-4">Block Statistics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* All blocks counter */}
        <div className="flex flex-col items-center justify-center p-5 bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-md border border-blue-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-blue-500 mr-2 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
            </svg>
            <h3 className="text-sm font-semibold text-gray-700">All Blocks</h3>
          </div>
          <p className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400">
            {totalBlocks.toLocaleString()}
          </p>
          <div className="mt-2 h-1 w-16 rounded-full bg-gradient-to-r from-blue-600 to-blue-300"></div>
        </div>
        
        {/* Flashblocks counter */}
        <div className="flex flex-col items-center justify-center p-5 bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-md border border-blue-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-blue-500 mr-2 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
            <h3 className="text-sm font-semibold text-gray-700">FlashBlocks</h3>
          </div>
          <p className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400">
            {totalFlashBlocks.toLocaleString()}
          </p>
          <span className="text-xs text-blue-500 mt-2 font-medium bg-blue-50 px-2 py-1 rounded-full">~200ms</span>
        </div>
        
        {/* Standard blocks counter */}
        <div className="flex flex-col items-center justify-center p-5 bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-md border border-blue-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-blue-500 mr-2 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
            </svg>
            <h3 className="text-sm font-semibold text-gray-700">Standard Blocks</h3>
          </div>
          <p className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400">
            {totalStandardBlocks.toLocaleString()}
          </p>
          <span className="text-xs text-blue-500 mt-2 font-medium bg-blue-50 px-2 py-1 rounded-full">~2s</span>
        </div>
      </div>
      
      <div className="mt-4 text-center text-sm text-gray-600">
        <p>Each FlashBlock is 10x faster than a standard block!</p>
        <p className="mt-1 text-blue-600 font-medium">Total blocks: {totalBlocks} ({totalFlashBlocks} FlashBlocks + {totalStandardBlocks} Standard Blocks)</p>
      </div>
    </div>
  );
};

export default BlockStats; 