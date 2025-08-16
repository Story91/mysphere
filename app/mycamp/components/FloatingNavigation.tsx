'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  gradient: string;
  glowColor: string;
  description: string;
  href?: string;
  onClick?: () => void;
}

interface FloatingNavigationProps {
  items: NavItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function FloatingNavigation({ items, activeTab, onTabChange }: FloatingNavigationProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [magneticItems, setMagneticItems] = useState<{ [key: string]: { x: number; y: number } }>({});
  
  // Magnetic effect on mouse move
  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.current) return;
    
    const items = containerRef.current.querySelectorAll('[data-nav-item]');
    const newMagneticItems: { [key: string]: { x: number; y: number } } = {};
    
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenterX = rect.left + rect.width / 2;
      const itemCenterY = rect.top + rect.height / 2;
      
      const distanceX = e.clientX - itemCenterX;
      const distanceY = e.clientY - itemCenterY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
      
      const maxDistance = 150;
      const strength = Math.max(0, (maxDistance - distance) / maxDistance);
      
      const itemId = item.getAttribute('data-nav-item');
      if (itemId) {
        newMagneticItems[itemId] = {
          x: distanceX * strength * 0.2,
          y: distanceY * strength * 0.2
        };
      }
    });
    
    setMagneticItems(newMagneticItems);
  };
  
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  
  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
      className="relative"
    >
      {/* Background glow effect */}
      <motion.div
        className="absolute inset-0 rounded-3xl blur-3xl opacity-30"
        animate={{
          background: [
            'linear-gradient(45deg, rgba(14, 165, 233, 0.3), rgba(168, 85, 247, 0.3))',
            'linear-gradient(45deg, rgba(168, 85, 247, 0.3), rgba(249, 115, 22, 0.3))',
            'linear-gradient(45deg, rgba(249, 115, 22, 0.3), rgba(14, 165, 233, 0.3))',
          ]
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "linear"
        }}
      />
      
      {/* Glass container */}
      <div className="relative backdrop-blur-2xl bg-white/[0.03] border border-white/[0.1] rounded-3xl p-2">
        {/* Active tab indicator */}
        <motion.div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          initial={false}
        >
          {items.map((item, index) => (
            activeTab === item.id && (
              <motion.div
                key={item.id}
                layoutId="activeIndicator"
                className="absolute rounded-2xl"
                style={{
                  background: `linear-gradient(135deg, ${item.glowColor}40, ${item.glowColor}20)`,
                  border: `1px solid ${item.glowColor}50`,
                  left: `${(index * (100 / items.length))}%`,
                  width: `${100 / items.length}%`,
                  height: '100%',
                  padding: '8px'
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30
                }}
              />
            )
          ))}
        </motion.div>
        
        {/* Navigation items */}
        <div className="relative grid grid-cols-3 lg:grid-cols-6 gap-2">
          {items.map((item, index) => {
            const ItemWrapper = item.href ? Link : 'button' as any;
            const wrapperProps = item.href 
              ? { href: item.href }
              : { onClick: item.onClick || (() => onTabChange(item.id)) };
            
            return (
              <ItemWrapper
                key={item.id}
                {...wrapperProps}
                className="block"
              >
                <motion.div
                  data-nav-item={item.id}
                  className="relative group cursor-pointer"
                  style={{
                    transform: magneticItems[item.id] 
                      ? `translate(${magneticItems[item.id].x}px, ${magneticItems[item.id].y}px)`
                      : 'none',
                    transition: 'transform 0.2s ease-out'
                  }}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {/* Item background */}
                  <motion.div
                    className="relative overflow-hidden rounded-2xl p-4 transition-all duration-300"
                    style={{
                      background: activeTab === item.id
                        ? `linear-gradient(135deg, ${item.glowColor}20, transparent)`
                        : hoveredItem === item.id
                        ? `linear-gradient(135deg, ${item.glowColor}15, transparent)`
                        : 'transparent'
                    }}
                  >
                    {/* Animated gradient overlay */}
                    {hoveredItem === item.id && (
                      <motion.div
                        className="absolute inset-0 opacity-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                          background: `radial-gradient(circle at 50% 50%, ${item.glowColor}30, transparent)`
                        }}
                      />
                    )}
                    
                    {/* Floating particles on hover */}
                    {hoveredItem === item.id && (
                      <>
                        {[...Array(3)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute w-1 h-1 rounded-full"
                            style={{
                              backgroundColor: item.glowColor,
                              left: `${20 + i * 30}%`,
                              bottom: '10%'
                            }}
                            animate={{
                              y: [-10, -30, -10],
                              opacity: [0, 1, 0]
                            }}
                            transition={{
                              duration: 2,
                              delay: i * 0.3,
                              repeat: Infinity,
                              ease: "easeOut"
                            }}
                          />
                        ))}
                      </>
                    )}
                    
                    {/* Icon with 3D effect */}
                    <motion.div
                      className="relative z-10 text-center"
                      animate={activeTab === item.id ? {
                        y: [0, -2, 0]
                      } : {}}
                      transition={{
                        duration: 2,
                        repeat: activeTab === item.id ? Infinity : 0,
                        ease: "easeInOut"
                      }}
                    >
                      <div className="text-2xl mb-2">{item.icon}</div>
                      <div className={`text-xs font-bold tracking-wider transition-colors duration-300 ${
                        activeTab === item.id 
                          ? 'text-white' 
                          : hoveredItem === item.id
                          ? 'text-white/90'
                          : 'text-white/60'
                      }`}>
                        {item.label}
                      </div>
                    </motion.div>
                    
                    {/* Pulse effect for active tab */}
                    {activeTab === item.id && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        style={{
                          border: `2px solid ${item.glowColor}40`
                        }}
                        animate={{
                          opacity: [0, 1, 0],
                          scale: [0.95, 1.05, 0.95]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      />
                    )}
                  </motion.div>
                  
                  {/* Tooltip on hover */}
                  {hoveredItem === item.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50"
                    >
                      <div className="bg-black/90 backdrop-blur-xl rounded-lg px-3 py-2 whitespace-nowrap border border-white/20">
                        <p className="text-white/90 text-xs font-medium">{item.description}</p>
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black/90"></div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </ItemWrapper>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
