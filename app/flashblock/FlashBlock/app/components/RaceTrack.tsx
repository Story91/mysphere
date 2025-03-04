"use client";

import React, { useEffect, useState } from 'react';

// Block/car type
interface Block {
  id: number;
  number: string;
  type: 'flashblock' | 'standard';
  transactions: number;
  position: number;
  finished: boolean;
  startTime: number;
  timestamp?: string;
  hash?: string;
}

// Props for the RaceTrack component
interface RaceTrackProps {
  standardBlock?: any;
  flashBlock?: any;
  isRacing?: boolean;
}

// Constants for animation
const FINISH_LINE = 80; // Position of finish line (%)
const TRACK_END = 85; // Position where cars should be removed (%)

export default function RaceTrack({ standardBlock, flashBlock, isRacing = false }: RaceTrackProps = {}) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastBlockId, setLastBlockId] = useState(0);
  
  // Store historical blocks for display (limited to 10)
  const [standardBlocks, setStandardBlocks] = useState<any[]>([]);
  const [flashBlocks, setFlashBlocks] = useState<any[]>([]);
  
  // Total counters for all blocks since page load
  const [totalStandardBlocks, setTotalStandardBlocks] = useState(0);
  const [totalFlashBlocks, setTotalFlashBlocks] = useState(0);
  
  // Initialize animation
  useEffect(() => {
    setLoading(false);
    
    // Start animation
    const animationFrame = startAnimation();
    
    // Clean up blocks that have gone off screen
    const cleanupInterval = setInterval(() => {
      setBlocks(prev => prev.filter(block => block.position < TRACK_END));
    }, 1000);
    
    return () => {
      cancelAnimationFrame(animationFrame);
      clearInterval(cleanupInterval);
    };
  }, []);

  // Add demo blocks when isRacing changes
  useEffect(() => {
    if (isRacing) {
      // Add a standard block
      const standardBlockData = {
        number: Math.floor(Math.random() * 10000).toString(),
        transactions: Math.floor(Math.random() * 50) + 10,
        hash: '0x' + Math.random().toString(16).substring(2, 42),
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Add a flashblock
      const flashBlockData = {
        number: Math.floor(Math.random() * 10000).toString(),
        transactions: Math.floor(Math.random() * 100) + 50,
        hash: '0x' + Math.random().toString(16).substring(2, 42),
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      addRealBlock('standard', standardBlockData);
      addRealBlock('flashblock', flashBlockData);
    }
  }, [isRacing]);
  
  // Add real blocks when props change
  useEffect(() => {
    if (standardBlock && standardBlock.number) {
      // Check if this block is already in our list
      const blockExists = standardBlocks.some(b => 
        b.number.toString() === standardBlock.number.toString()
      );
      
      if (!blockExists) {
        // Add to race animation
        const blockExistsInRace = blocks.some(b => 
          b.type === 'standard' && b.number === standardBlock.number.toString()
        );
        
        if (!blockExistsInRace) {
          addRealBlock('standard', standardBlock);
        }
        
        // Add to historical blocks (limited to 10 for display)
        setStandardBlocks(prev => {
          const newBlocks = [standardBlock, ...prev].slice(0, 10);
          return newBlocks;
        });
        
        // Increment total counter
        setTotalStandardBlocks(prev => prev + 1);
      }
    }
  }, [standardBlock]);
  
  useEffect(() => {
    if (flashBlock && flashBlock.number) {
      // Check if this block is already in our list
      const blockExists = flashBlocks.some(b => 
        b.number.toString() === flashBlock.number.toString()
      );
      
      if (!blockExists) {
        // Add to race animation
        const blockExistsInRace = blocks.some(b => 
          b.type === 'flashblock' && b.number === flashBlock.number.toString()
        );
        
        if (!blockExistsInRace) {
          addRealBlock('flashblock', flashBlock);
        }
        
        // Add to historical blocks (limited to 10 for display)
        setFlashBlocks(prev => {
          const newBlocks = [flashBlock, ...prev].slice(0, 10);
          return newBlocks;
        });
        
        // Increment total counter
        setTotalFlashBlocks(prev => prev + 1);
      }
    }
  }, [flashBlock]);
  
  // Add a real block from props
  const addRealBlock = (type: 'flashblock' | 'standard', blockData: any) => {
    setLastBlockId(prev => prev + 1);
    const newId = lastBlockId + 1;
    const now = Date.now();
    
    const newBlock: Block = {
      id: newId,
      number: blockData.number.toString(),
      type: type,
      transactions: blockData.transactions?.length || 0,
      position: -10, // Start off-screen from the left
      finished: false,
      startTime: now,
      timestamp: formatTime(now),
      hash: blockData.hash
    };
    
    setBlocks(prev => {
      // Keep only blocks that haven't reached the end
      const existingBlocks = prev.filter(block => block.position < TRACK_END);
      
      // Limit to 10 blocks of each type on the track
      const standardBlocks = existingBlocks.filter(block => block.type === 'standard');
      const flashBlocks = existingBlocks.filter(block => block.type === 'flashblock');
      
      if (type === 'standard' && standardBlocks.length >= 10) {
        // If we have more than 10 standard blocks, remove the oldest
        const oldestStandardBlockId = standardBlocks
          .sort((a, b) => a.id - b.id)[0]?.id;
        
        return [
          ...existingBlocks.filter(block => 
            block.type !== 'standard' || block.id !== oldestStandardBlockId
          ),
          newBlock
        ];
      } else if (type === 'flashblock' && flashBlocks.length >= 10) {
        // If we have more than 10 flash blocks, remove the oldest
        const oldestFlashBlockId = flashBlocks
          .sort((a, b) => a.id - b.id)[0]?.id;
        
        return [
          ...existingBlocks.filter(block => 
            block.type !== 'flashblock' || block.id !== oldestFlashBlockId
          ),
          newBlock
        ];
      }
      
      return [...existingBlocks, newBlock];
    });
  };
  
  // Format time as HH:MM:SS
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toTimeString().substring(0, 8);
  };
  
  // Format block timestamp
  const formatBlockTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };
  
  // Function to animate car movement
  const startAnimation = () => {
    const animate = () => {
      setBlocks(prev => 
        prev.map(block => {
          const duration = block.type === 'flashblock' ? 2000 : 10000; // 2s for Flashblock, 10s for Standard
          const now = Date.now();
          const elapsed = now - block.startTime;
          const progress = elapsed / duration;
          
          // Position from -10% (off-screen) to 120% (off-screen right)
          const newPosition = -10 + (progress * 130);
          
          // Mark as finished when crossing the finish line
          const justFinished = !block.finished && newPosition >= FINISH_LINE;
          
          return {
            ...block,
            position: newPosition,
            finished: block.finished || justFinished
          };
        }).filter(block => block.position < TRACK_END) // Remove blocks that have gone past the end
      );
      
      return requestAnimationFrame(animate);
    };
    
    return requestAnimationFrame(animate);
  };
  
  // Generate random spark positions for each block
  const generateSparkPositions = (blockId: number) => {
    // Use the block ID as a seed for consistent but unique spark positions
    const seed = blockId * 1000;
    const positions = [];
    
    for (let i = 0; i < 5; i++) {
      // Generate pseudo-random positions based on block ID
      const x = ((seed + i * 123) % 80) - 40; // Range: -40 to 40
      const y = ((seed + i * 456) % 30) - 15; // Range: -15 to 15
      positions.push({ x, y });
    }
    
    return positions;
  };
  
  // Calculate speed percentage for visual effects
  const getSpeedPercentage = (block: Block) => {
    const duration = block.type === 'flashblock' ? 2000 : 10000;
    const elapsed = Date.now() - block.startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Speed ramps up at start, maintains in middle, slows at finish
    if (progress < 0.2) {
      // Acceleration phase
      return progress * 5; // 0 to 1 over first 20%
    } else if (progress > 0.8) {
      // Deceleration phase (only if past finish line)
      return block.position > FINISH_LINE ? 1 - (progress - 0.8) * 5 : 1; // 1 to 0 over last 20%
    }
    // Cruising phase
    return 1;
  };
  
  if (loading) {
    return (
      <div className="h-[400px] w-full rounded-xl overflow-hidden bg-gradient-to-br from-white to-blue-50 flex items-center justify-center border border-blue-200 shadow-lg">
        <div className="text-blue-600 text-lg font-medium animate-pulse flex items-center">
          <svg className="animate-spin h-6 w-6 mr-2 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading race data...
        </div>
      </div>
    );
  }
  
  // Filter blocks by type and remove those off-screen
  const visibleBlocks = blocks.filter(block => block.position > -15 && block.position < TRACK_END);
  const visibleFlashblocks = visibleBlocks.filter(block => block.type === 'flashblock');
  const visibleStandardBlocks = visibleBlocks.filter(block => block.type === 'standard');
  
  // Get the latest 10 blocks of each type from real data
  const latestFlashblocksData = flashBlocks.slice(0, 10);
  const latestStandardBlocksData = standardBlocks.slice(0, 10);

  return (
    <div className="grid gap-6 mb-6">
      {/* Race track */}
      <div className="h-[320px] sm:h-[400px] w-full rounded-xl overflow-hidden bg-gradient-to-br from-gray-900 to-blue-900 p-3 sm:p-4 relative shadow-lg border border-blue-500">
        <div className="absolute inset-0 bg-grid-pattern opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/50 to-transparent"></div>
        
        <h2 className="text-lg sm:text-xl font-bold mb-1 sm:mb-2 text-center relative z-10">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 font-mono tracking-wider">RACE: FLASHBLOCK VS STANDARD</span>
        </h2>
        <p className="text-xs sm:text-sm text-blue-300 text-center mb-2 sm:mb-4 relative z-10 font-light">Flashblock is <span className="text-cyan-300 font-bold">10x</span> faster than a standard block!</p>
        
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-[180px] sm:h-[220px] bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-t border-b border-blue-500/50 shadow-inner">
          {/* Grid overlay */}
          <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
          
          {/* Horizon effect */}
          <div className="absolute right-0 inset-y-0 w-[150px] bg-gradient-to-l from-blue-900 via-blue-800/50 to-transparent"></div>
          <div className="absolute right-0 inset-y-0 w-[50px] bg-gradient-to-l from-blue-900 to-transparent opacity-80"></div>
          
          {/* Track lines */}
          <div className="absolute top-1/4 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
          <div className="absolute top-3/4 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
          
          {/* Start line */}
          <div className="absolute left-[10%] inset-y-0 w-[2px] bg-gradient-to-b from-blue-400 via-cyan-400 to-blue-400 flex flex-col justify-between py-2 glow-blue">
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-slow"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-slow"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-slow"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-slow"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-slow"></div>
          </div>
          
          {/* Finish line */}
          <div className="absolute right-[20%] inset-y-0 w-[3px] sm:w-[4px] bg-gradient-to-b from-cyan-500 via-blue-400 to-cyan-500 flex flex-col justify-between py-2 glow-blue z-20">
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
            <div className="w-full h-[3px] sm:h-[4px] bg-cyan-400 rounded animate-pulse-fast"></div>
          </div>
          
          {/* Lane labels */}
          <div className="absolute left-2 top-1/4 transform -translate-y-1/2 text-[10px] sm:text-xs font-mono tracking-wider bg-blue-900/80 text-cyan-300 px-2 sm:px-3 py-0.5 sm:py-1 rounded-md border border-blue-500/50 backdrop-blur-sm shadow-glow-sm">
            <div className="flex items-center">
              <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-cyan-400 rounded-full mr-1 sm:mr-2 animate-pulse"></div>
              FLASHBLOCK LANE
            </div>
          </div>
          <div className="absolute left-2 top-3/4 transform -translate-y-1/2 text-[10px] sm:text-xs font-mono tracking-wider bg-gray-800/80 text-gray-300 px-2 sm:px-3 py-0.5 sm:py-1 rounded-md border border-gray-600/50 backdrop-blur-sm">
            <div className="flex items-center">
              <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-gray-400 rounded-full mr-1 sm:mr-2"></div>
              STANDARD LANE
            </div>
          </div>
          
          {/* Time labels */}
          <div className="absolute right-[18%] top-1/4 transform -translate-y-1/2 text-[10px] sm:text-xs font-mono tracking-wider text-cyan-300 bg-blue-900/80 px-2 sm:px-3 py-0.5 sm:py-1 rounded-md border border-blue-500/50 backdrop-blur-sm shadow-glow-sm">
            <div className="flex items-center">
              <span className="text-base sm:text-lg font-bold mr-0.5 sm:mr-1">0.2</span>s
            </div>
          </div>
          <div className="absolute right-[18%] top-3/4 transform -translate-y-1/2 text-[10px] sm:text-xs font-mono tracking-wider text-gray-300 bg-gray-800/80 px-2 sm:px-3 py-0.5 sm:py-1 rounded-md border border-gray-600/50 backdrop-blur-sm">
            <div className="flex items-center">
              <span className="text-base sm:text-lg font-bold mr-0.5 sm:mr-1">2.0</span>s
            </div>
          </div>
          
          {/* Distance markers */}
          {[20, 30, 40, 50, 60, 70].map((position) => (
            <div key={position} className="absolute top-0 bottom-0 w-[1px] bg-blue-500/20" style={{ left: `${position}%` }}>
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 text-[6px] sm:text-[8px] text-blue-400 font-mono">
                {position}%
              </div>
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-[6px] sm:text-[8px] text-blue-400 font-mono">
                {position}%
              </div>
            </div>
          ))}
          
          {/* Flashblock cars */}
          {visibleFlashblocks.map((block) => {
            const sparkPositions = generateSparkPositions(block.id);
            const speedPercentage = getSpeedPercentage(block);
            const isAccelerating = speedPercentage > 0.2 && speedPercentage < 0.5;
            const isMaxSpeed = speedPercentage >= 0.8;
            
            return (
              <div 
                key={block.id}
                className={`absolute h-[30px] sm:h-[40px] w-[60px] sm:w-[80px] ${isAccelerating ? 'animate-warp' : ''}`}
                style={{ 
                  top: `${25}%`,
                  left: `${block.position}%`,
                  transform: 'translate(0, -50%)',
                  zIndex: 100 - block.id
                }}
              >
                {/* Space distortion effect - only at high speeds */}
                {isMaxSpeed && (
                  <div className={`space-distortion ${isMaxSpeed ? 'active' : ''}`}></div>
                )}
                
                {/* Car body */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg shadow-lg border border-blue-300 shadow-glow-blue">
                  {/* Cockpit */}
                  <div className="absolute top-0 left-1/2 w-[22px] sm:w-[30px] h-[10px] sm:h-[14px] bg-gradient-to-b from-blue-400 to-blue-800 rounded-t-lg transform -translate-x-1/2"></div>
                  
                  {/* Wheels */}
                  <div className="absolute bottom-[-4px] left-[8px] w-[10px] sm:w-[14px] h-[6px] sm:h-[8px] bg-black rounded-full shadow"></div>
                  <div className="absolute bottom-[-4px] right-[8px] w-[10px] sm:w-[14px] h-[6px] sm:h-[8px] bg-black rounded-full shadow"></div>
                  
                  {/* Lights */}
                  <div className="absolute top-1/2 right-[2px] w-[4px] sm:w-[5px] h-[4px] sm:h-[5px] bg-red-500 rounded-full transform -translate-y-1/2 shadow-md"></div>
                  <div className="absolute top-1/2 left-[2px] w-[4px] sm:w-[5px] h-[4px] sm:h-[5px] bg-yellow-400 rounded-full transform -translate-y-1/2 shadow-md"></div>
                  
                  {/* Block number */}
                  <div className="absolute top-[3px] left-1/2 transform -translate-x-1/2 text-white text-[7px] sm:text-[9px] font-bold font-mono">
                    #{block.number}
                  </div>
                  
                  {/* Digital speed indicator */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-cyan-300 text-[6px] sm:text-[8px] font-mono font-bold">
                    FLASH
                  </div>
                  
                  {/* Energy core */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-300 rounded-lg opacity-0 animate-pulse-fast"
                    style={{ opacity: speedPercentage * 0.3 }}
                  ></div>
                  
                  {/* Subblocks indicator */}
                  <div className="absolute bottom-[2px] left-1/2 transform -translate-x-1/2 flex space-x-[1px]">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-[2px] sm:w-[3px] h-[2px] sm:h-[3px] bg-cyan-300 rounded-full animate-pulse"></div>
                    ))}
                  </div>
                </div>
                
                {/* Turbo boost effect - only during acceleration */}
                {isAccelerating && (
                  <div className="absolute -right-[8px] sm:-right-[10px] top-1/2 transform -translate-y-1/2 w-[15px] sm:w-[20px] h-[15px] sm:h-[20px]">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-transparent rounded-full animate-pulse-fast"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-300 via-blue-400 to-transparent rounded-full blur-sm animate-pulse-fast" style={{ animationDelay: '0.1s' }}></div>
                  </div>
                )}
                
                {/* Speed effect - trail length based on speed */}
                <div 
                  className="absolute right-full top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-300 to-blue-500 opacity-80 shadow-glow-blue"
                  style={{ 
                    width: `${90 * speedPercentage}px`,
                    height: '2px'
                  }}
                ></div>
                
                {/* Trail effect */}
                <div 
                  className="absolute right-full top-1/2 transform -translate-y-1/2 -translate-x-[15px] bg-gradient-to-r from-transparent to-blue-300 opacity-20 rounded-full blur-md"
                  style={{ 
                    width: `${30 * speedPercentage}px`,
                    height: `${15 * speedPercentage}px`
                  }}
                ></div>
                
                {/* Sparks - only show when at high speed */}
                {speedPercentage > 0.7 && sparkPositions.map((pos, idx) => (
                  <div 
                    key={idx}
                    className="absolute w-[1px] sm:w-[2px] h-[1px] sm:h-[2px] bg-cyan-300 rounded-full animate-spark"
                    style={{ 
                      right: `${pos.x * 0.75}px`, 
                      top: `50%`,
                      transform: `translateY(${pos.y * 0.75}px)`,
                      opacity: Math.random() * 0.7 + 0.3,
                      animationDelay: `${idx * 0.1}s`
                    }}
                  ></div>
                ))}
                
                {/* Energy rings - only during acceleration */}
                {isAccelerating && [...Array(3)].map((_, idx) => (
                  <div 
                    key={idx}
                    className="absolute inset-0 rounded-full border border-cyan-300 opacity-0"
                    style={{ 
                      animation: `ring-expand 1s ease-out ${idx * 0.2}s infinite`
                    }}
                  ></div>
                ))}
                
                {/* Transactions */}
                <div className="absolute bottom-[-15px] sm:bottom-[-18px] left-1/2 transform -translate-x-1/2 text-cyan-300 text-[8px] sm:text-[10px] font-medium font-mono bg-blue-900/80 px-1 sm:px-2 py-0.5 rounded-md shadow-sm border border-blue-500/50 backdrop-blur-sm">
                  {block.transactions} tx
                </div>
              </div>
            );
          })}
          
          {/* Standard cars */}
          {visibleStandardBlocks.map((block) => {
            const speedPercentage = getSpeedPercentage(block);
            return (
              <div 
                key={block.id}
                className="absolute h-[30px] sm:h-[40px] w-[60px] sm:w-[80px]"
                style={{ 
                  top: `${75}%`,
                  left: `${block.position}%`,
                  transform: 'translate(0, -50%)',
                  zIndex: 100 - block.id
                }}
              >
                {/* Car body */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600 rounded-lg shadow-lg border border-gray-300">
                  {/* Cockpit */}
                  <div className="absolute top-0 left-1/2 w-[22px] sm:w-[30px] h-[10px] sm:h-[14px] bg-gradient-to-b from-gray-400 to-gray-800 rounded-t-lg transform -translate-x-1/2"></div>
                  
                  {/* Wheels */}
                  <div className="absolute bottom-[-4px] left-[8px] w-[10px] sm:w-[14px] h-[6px] sm:h-[8px] bg-black rounded-full shadow"></div>
                  <div className="absolute bottom-[-4px] right-[8px] w-[10px] sm:w-[14px] h-[6px] sm:h-[8px] bg-black rounded-full shadow"></div>
                  
                  {/* Lights */}
                  <div className="absolute top-1/2 right-[2px] w-[4px] sm:w-[5px] h-[4px] sm:h-[5px] bg-red-500 rounded-full transform -translate-y-1/2 shadow-md"></div>
                  <div className="absolute top-1/2 left-[2px] w-[4px] sm:w-[5px] h-[4px] sm:h-[5px] bg-yellow-400 rounded-full transform -translate-y-1/2 shadow-md"></div>
                  
                  {/* Block number */}
                  <div className="absolute top-[3px] left-1/2 transform -translate-x-1/2 text-white text-[7px] sm:text-[9px] font-bold font-mono">
                    #{block.number}
                  </div>
                  
                  {/* Digital speed indicator */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-300 text-[6px] sm:text-[8px] font-mono font-bold">
                    STD
                  </div>
                </div>
                
                {/* Speed effect - trail length based on speed */}
                <div 
                  className="absolute right-full top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-transparent to-gray-400"
                  style={{ 
                    width: `${30 * speedPercentage}px`,
                    height: '1px'
                  }}
                ></div>
                
                {/* Transactions */}
                <div className="absolute bottom-[-15px] sm:bottom-[-18px] left-1/2 transform -translate-x-1/2 text-gray-300 text-[8px] sm:text-[10px] font-medium font-mono bg-gray-800/80 px-1 sm:px-2 py-0.5 rounded-md shadow-sm border border-gray-600/50 backdrop-blur-sm">
                  {block.transactions} tx
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add a global style for animations and grid patterns */}
      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-fast {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-fast {
          animation: pulse-fast 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes spark {
          0% { transform: translateY(var(--y)) scale(0.5); opacity: 1; }
          100% { transform: translateY(calc(var(--y) - 10px)) scale(0); opacity: 0; }
        }
        .animate-spark {
          --y: 0px;
          animation: spark 0.5s ease-out forwards;
        }
        @keyframes warp-speed {
          0% { transform: scale(1) skewX(0); filter: brightness(1); }
          50% { transform: scale(1.05, 0.95) skewX(-15deg); filter: brightness(1.2); }
          100% { transform: scale(1) skewX(0); filter: brightness(1); }
        }
        .animate-warp {
          animation: warp-speed 0.5s ease-in-out;
        }
        @keyframes ring-expand {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2); opacity: 0; }
        }
        .bg-grid-pattern {
          background-image: radial-gradient(rgba(59, 130, 246, 0.3) 1px, transparent 1px), 
                            linear-gradient(to right, rgba(59, 130, 246, 0.1) 1px, transparent 1px);
          background-size: 20px 20px, 100px 100px;
          background-position: center;
        }
        .shadow-glow-blue {
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
        }
        .shadow-glow-sm {
          box-shadow: 0 0 5px rgba(56, 189, 248, 0.3);
        }
        .glow-blue {
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
        }
        .space-distortion {
          position: absolute;
          inset: -10px;
          background: radial-gradient(circle at center, transparent 30%, rgba(6, 182, 212, 0.1) 70%, transparent 100%);
          border-radius: 16px;
          filter: blur(4px);
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .space-distortion.active {
          opacity: 1;
          animation: distort 1s ease-in-out infinite;
        }
        @keyframes distort {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}