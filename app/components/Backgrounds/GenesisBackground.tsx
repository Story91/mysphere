'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import ThreeJsBackground from './ThreeJsBackground';

interface GenesisBackgroundProps {
  intensity?: number;
}

const GenesisBackground: React.FC<GenesisBackgroundProps> = ({ intensity = 0.8 }) => {
  const additionalEffectsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add additional effects that can overlay with the ThreeJs background
    addGlowingOrbs();
    addGridLines();

    return () => {
      // Clean up effects
      if (additionalEffectsRef.current) {
        while (additionalEffectsRef.current.firstChild) {
          additionalEffectsRef.current.removeChild(additionalEffectsRef.current.firstChild);
        }
      }
    };
  }, [intensity]);

  // Add glowing orbs that float around
  const addGlowingOrbs = () => {
    if (!additionalEffectsRef.current) return;
    
    const orbs: HTMLDivElement[] = [];
    const orbCount = 5;

    for (let i = 0; i < orbCount; i++) {
      const orb = document.createElement('div');
      const size = 50 + Math.random() * 100;
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;

      orb.style.position = 'absolute';
      orb.style.width = `${size}px`;
      orb.style.height = `${size}px`;
      orb.style.borderRadius = '50%';
      orb.style.background = `radial-gradient(circle, rgba(67, 84, 255, ${0.2 * intensity}), rgba(67, 84, 255, 0))`;
      orb.style.left = `${x}px`;
      orb.style.top = `${y}px`;
      orb.style.filter = 'blur(10px)';
      orb.style.animation = `pulse ${3 + Math.random() * 4}s infinite alternate ease-in-out`;
      orb.style.zIndex = '-1';

      if (additionalEffectsRef.current) {
        additionalEffectsRef.current.appendChild(orb);
        orbs.push(orb);
      }
    }
  };

  // Add subtle grid lines
  const addGridLines = () => {
    if (!additionalEffectsRef.current) return;
    
    const gridContainer = document.createElement('div');
    gridContainer.style.position = 'absolute';
    gridContainer.style.top = '0';
    gridContainer.style.left = '0';
    gridContainer.style.width = '100%';
    gridContainer.style.height = '100%';
    gridContainer.style.backgroundImage = 
      `linear-gradient(rgba(67, 84, 255, ${0.05 * intensity}) 1px, transparent 1px),
       linear-gradient(90deg, rgba(67, 84, 255, ${0.05 * intensity}) 1px, transparent 1px)`;
    gridContainer.style.backgroundSize = '50px 50px';
    gridContainer.style.zIndex = '-1';
    gridContainer.style.opacity = '0.3';
    gridContainer.style.transform = 'perspective(500px) rotateX(60deg)';
    gridContainer.style.transformOrigin = 'center center';
    gridContainer.style.backgroundPosition = 'center center';

    if (additionalEffectsRef.current) {
      additionalEffectsRef.current.appendChild(gridContainer);
    }
  };

  return (
    <>
      <ThreeJsBackground 
        color="#4354ff" 
        particleCount={1500} 
        particleSize={0.03} 
        speed={0.0005}
      />
      <div
        ref={additionalEffectsRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: -1,
          overflow: 'hidden'
        }}
      />
      <style jsx global>{`
        @keyframes pulse {
          0% {
            opacity: ${0.3 * intensity};
            transform: scale(0.8);
          }
          100% {
            opacity: ${0.7 * intensity};
            transform: scale(1.2);
          }
        }
      `}</style>
    </>
  );
};

export default GenesisBackground; 