'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { globalStyles } from '../styles/global';

// Add styles to the document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = globalStyles.gradientAnimation;
  document.head.appendChild(style);
}

// Model container component with positioning
function ModelContainer({ isMobile }: { isMobile: boolean }) {
  return (
    <Suspense fallback={null}>
      {/* Adjust model position for mobile */}
      <group 
        position={[isMobile ? -1.0 : 0, isMobile ? -0.3 : 0, 0]} 
        scale={isMobile ? 0.95 : 1}
        rotation={[0, isMobile ? 0.1 : 0, 0]} // Slight rotation on mobile for better visibility
      >
        <RobotModel />
      </group>
    </Suspense>
  );
}

// Custom camera for both mouse interactivity and proper positioning
function CustomCamera({ isMobile }: { isMobile: boolean }) {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  
  // Set initial camera position
  useEffect(() => {
    // Mobile needs different camera positioning
    if (isMobile) {
      camera.position.z = 8; // Closer camera for larger robot appearance
      camera.position.y = -0.3; // Adjusted to move view upward a bit
      camera.position.x = -0.5; // Move to the left to center robot on screen
    } else {
      camera.position.z = 5;
    }
    camera.lookAt(0, 0, 0);
  }, [camera, isMobile]);
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta && e.gamma) {
        // Convert device orientation to mouse position equivalent
        mouseRef.current.x = (e.gamma / 45) * 0.5; // gamma: left/right tilt
        mouseRef.current.y = -(e.beta / 45) * 0.5; // beta: front/back tilt
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, []);
  
  useFrame(() => {
    // Apply smooth motion to camera position based on mouse/device movement
    // Adjust sensitivity for mobile
    const sensitivity = isMobile ? 0.01 : 0.05; // Reduce sensitivity on mobile
    
    // For mobile, limit horizontal camera movement to keep robot in frame
    if (isMobile) {
      const targetX = Math.max(-0.8, Math.min(-0.2, mouseRef.current.x * 0.5 - 0.5)); // Keep to the left
      camera.position.x += (targetX - camera.position.x) * sensitivity;
      
      const targetY = Math.max(-0.5, Math.min(0.1, mouseRef.current.y * 0.5 - 0.3)); // Adjust vertical limits
      camera.position.y += (targetY - camera.position.y) * sensitivity;
    } else {
      camera.position.x += (mouseRef.current.x * 0.5 - camera.position.x) * sensitivity;
      camera.position.y += (mouseRef.current.y * 0.5 - camera.position.y) * sensitivity;
    }
    
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// Dynamically import the RobotModel
const RobotModel = dynamic(() => import('../components/RobotModel').then(mod => mod.RobotModel), {
  ssr: false
});

export default function AIChatAgent() {
  // Add state for device type detection
  const [isMobile, setIsMobile] = useState(false);
  
  // Check if the device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="h-screen bg-gradient-to-br from-white to-[#EEF3FF] flex relative overflow-hidden">
      {/* 3D Model Background - adjust for better mobile visibility */}
      <div className="absolute inset-0 z-0">
        <Canvas
          camera={{ 
            position: [isMobile ? -0.5 : 0, 0, isMobile ? 9 : 5], 
            fov: isMobile ? 55 : 45,
            near: 0.1,
            far: 1000
          }}
          style={{ background: 'transparent' }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={2} />
          <pointLight position={[10, 10, 10]} intensity={2.5} />
          <ModelContainer isMobile={isMobile} />
          <CustomCamera isMobile={isMobile} />
          <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
        </Canvas>
      </div>

      {/* Left Control Panel - Fixed width (Disabled) */}
      <div className="w-[200px] md:w-[250px] shrink-0 relative z-10 p-4 hidden md:block">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden border border-[#5788FA]/10 h-[calc(90vh-2rem)] p-4 flex flex-col opacity-75 pointer-events-none">
          {/* Header */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center gap-2">
              <motion.img 
                src="/favicon_io (1)/favicon-32x32.png" 
                alt="Spherian Logo" 
                className="w-6 h-6"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              />
              <h1 className="text-lg font-bold bg-gradient-to-r from-[#5788FA] to-[#FF00A8] text-transparent bg-clip-text">
                Spherian
              </h1>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="space-y-3 mb-6">
            <select
              disabled
              className="w-full px-3 py-1.5 rounded-lg bg-white text-[#5788FA] border border-[#5788FA]/20 focus:outline-none text-sm cursor-not-allowed"
            >
              <option>Chat Mode</option>
              <option>Two-Agent Mode</option>
            </select>
          </div>

          {/* Action Buttons - Disabled */}
          <div className="flex-1 space-y-2 overflow-y-auto pr-2">
            {[
              "Create Token",
              "Transfer Asset",
              "Get Balance",
              "Request ETH",
              "Generate Art",
              "Deploy NFT",
              "Mint NFT",
              "Swap Assets"
            ].map((action, idx) => (
              <div
                key={idx}
                className="w-full px-3 py-2 rounded-lg bg-white/50 text-[#5788FA]/70 border border-[#5788FA]/20 text-sm font-medium text-left cursor-not-allowed"
              >
                {action}
              </div>
            ))}
          </div>

          {/* Footer with Logos */}
          <div className="mt-4 pt-4 border-t border-[#5788FA]/10 space-y-3">
            <div className="bg-black/10 backdrop-blur-sm rounded-lg p-2 flex justify-center">
              <img 
                src="/brand-kit/base/logo/wordmark/Base_Wordmark_Blue.png"
                alt="Base"
                className="h-5 opacity-50"
              />
            </div>
            <div className="bg-black/10 backdrop-blur-sm rounded-lg p-2 flex justify-center">
              <img 
                src="/elo2.png"
                alt="Elo2"
                className="h-5 opacity-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Message - positioned in top-left on mobile, centered on desktop */}
      <div className={`absolute z-20 ${isMobile ? 'top-16 left-0 right-0 px-4' : 'inset-0 flex items-center justify-center px-4'}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-[#00A3FF]/20 ${
            isMobile ? 'w-[90%] mx-auto p-3' : 'w-full max-w-sm sm:max-w-md md:max-w-lg p-4 sm:p-8'
          }`}
        >
          <div className="text-center">
            <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-4 bg-gradient-to-r from-[#00F0FF] via-[#00A3FF] to-[#0047FF] bg-clip-text text-transparent">
              Spherian AI Assistant
            </h2>
            <p className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} text-[#0047FF]/80 mb-2 sm:mb-5`}>
              Hello! I'm your Spherian AI assistant. I'm currently in development and will be here to help you soon with all your Base ecosystem needs.
            </p>
            <div className="space-y-1 sm:space-y-3">
              <p className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm'} text-[#0047FF]/70`}>
                <span className="font-bold">Coming Features:</span> Create Token, Transfer Assets, Get Balance, Request ETH, Generate Art, Deploy & Mint NFTs, and Swap Assets
              </p>
              <div className="flex items-center justify-center space-x-2 text-[#00A3FF]/60 text-xs sm:text-sm">
                <span className="text-base sm:text-lg">🚀</span>
                <span>Coming Soon</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      
      {/* Chat Area on the right (Disabled) */}
      <div className="w-[500px] px-4 shrink-0 relative z-10 hidden md:block">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden border border-[#5788FA]/10 h-[calc(90vh-2rem)] opacity-75 pointer-events-none">
          {/* Empty Chat Area */}
          <div className="h-[calc(90vh-12rem)] p-4">
            <div className="flex justify-center items-center h-full">
              <p className="text-[#5788FA]/50 text-center">
                The AI chat functionality will be available soon
              </p>
            </div>
          </div>

          {/* Input - Disabled */}
          <div className="p-4 bg-white border-t border-[#5788FA]/10">
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="How can I help?"
                  disabled
                  className="flex-1 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-400 placeholder-gray-300 border border-[#5788FA]/20 cursor-not-allowed"
                />
                <button
                  disabled
                  className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <button
                disabled
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-400 border border-[#5788FA]/20 cursor-not-allowed w-full"
              >
                What actions can you take?
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile-specific bottom prompt */}
      {isMobile && (
        <div className="absolute bottom-12 left-0 right-0 z-30 flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="bg-white/90 backdrop-blur-md rounded-full px-6 py-3 shadow-lg border border-[#00A3FF]/30"
          >
            <p className="text-sm text-[#0047FF] font-medium text-center">
              Swipe up to explore our ecosystem
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
