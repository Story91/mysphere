'use client';

import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

export default function BridgePage() {
  const { address } = useAccount();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  const faqItems = [
    {
      question: "What bridging options are available on SPHERE?",
      answer: "SPHERE integrates with two leading bridge providers: Brid.gg for advanced users seeking customization, and Superbridge for those preferring a streamlined experience. Both options are secure and efficient for transferring assets."
    },
    {
      question: "How can I track my bridge transactions?",
      answer: "Both Brid.gg and Superbridge provide real-time transaction tracking. You can monitor your transfers directly through their interfaces, with detailed status updates and confirmation notifications."
    },
    {
      question: "Why does SPHERE use external bridge providers?",
      answer: "We partner with established bridge providers to ensure maximum security and reliability. This approach allows us to offer you battle-tested solutions while focusing on creating the best possible user experience in the Base ecosystem."
    },
    {
      question: "Who operates these bridge services?",
      answer: "Brid.gg is operated by Bridgg, while Superbridge is maintained by Blob Engineering. These are independent providers with proven track records in the blockchain space. SPHERE facilitates access to these services but operates independently."
    },
    {
      question: "Need help with bridging?",
      answer: "Our community is here to help! Join the SPHERE Discord for 24/7 support and guidance. You can also check our detailed guides and documentation for step-by-step instructions on using either bridge service."
    }
  ];

  return (
    <div className="min-h-screen bg-black">
      {/* Matrix background effect */}
      <div className="fixed inset-0 bg-black opacity-90">
        <div className="absolute inset-0 bg-[url('/matrix.png')] opacity-10 animate-matrix"></div>
      </div>

      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Glowing orbs - góra, środek i dół */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse delay-700"></div>
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-[#4C8FFF]/30 rounded-full filter blur-3xl animate-pulse delay-1000"></div>
      
      {/* Środkowe orby */}
      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-300"></div>
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-800"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-500"></div>
      
      {/* Dolne orby */}
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-200"></div>
      <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-600"></div>
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-[#0052FF]/5 rounded-full filter blur-3xl animate-pulse delay-900"></div>

      {/* Content */}
      <div className="relative z-10">
        {/* Hero section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 relative"
        >
          <div className="flex items-center justify-center mt-2">
            <div className="transform hover:scale-105 transition-transform duration-300">
              <Image
                src="/elo2.png"
                alt="SPHERE"
                width={450}
                height={120}
                quality={100}
                priority
                className="object-contain"
              />
            </div>
          </div>

          {/* Header */}
          <div className="text-center space-y-6 mt-10">
            <h1 className="text-4xl font-['Share_Tech_Mono'] text-[#0052FF]">
              Superchain Bridges
            </h1>
            <p className="text-xl text-gray-400 font-['Share_Tech_Mono'] mt-2">
              Go to Superbridge or Brid.gg to bridge your assets to and from Base
            </p>
            <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mt-2"></div>
          </div>
        </motion.div>

        {/* Bridge options */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-6xl mx-auto px-6 mt-16"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Brid.gg Card */}
            <motion.div variants={itemVariants} className="group relative">
              <div className="tooltip opacity-0 group-hover:opacity-100 transition-all duration-300 absolute -top-24 left-1/2 transform -translate-x-1/2 bg-black/90 text-white text-sm font-['Share_Tech_Mono'] px-6 py-4 rounded-2xl border border-purple-500/30 backdrop-blur-xl z-50 shadow-lg shadow-purple-500/20 w-[90%]">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-purple-400">🔧</span>
                    <span className="font-bold">Expert Features:</span>
                  </div>
                  <ul className="text-gray-300 space-y-2 text-sm list-disc list-inside">
                    <li>Custom gas settings for optimal transactions</li>
                    <li>Advanced routing options</li>
                    <li>Multiple token support</li>
                    <li>Transaction history tracking</li>
                  </ul>
                </div>
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-black/90 border-r border-b border-purple-500/30 rotate-45"></div>
              </div>
              <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500/50 via-pink-500/50 to-purple-500/50 rounded-xl blur-md group-hover:blur-xl transition-all duration-300 opacity-20 group-hover:opacity-30"></div>
              <a href="https://www.brid.gg/base?token=ETH&amount=&originChainId=1" target="_blank" rel="noopener noreferrer" className="block">
                <div className="aspect-square bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-purple-500/30 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-purple-500/20 p-8 relative">
                  {/* Background Image */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent">
                    <Image
                      src="/bridgg.png"
                      alt=""
                      fill
                      className="object-contain opacity-20 scale-[2] blur-lg"
                      quality={100}
                      priority
                    />
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl blur-xl"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex-grow flex flex-col items-center justify-center text-center space-y-4">
                      <Image
                        src="/bridgg.png"
                        alt="Brid.gg Logo"
                        width={120}
                        height={120}
                        quality={100}
                        priority
                        className="object-contain"
                      />
                      <h2 className="text-4xl font-['Share_Tech_Mono'] grid-title group-hover:text-purple-500">Brid.gg</h2>
                      <p className="text-gray-400 text-lg font-['Share_Tech_Mono']">By Bridgg</p>
                    </div>
                    <div className="mt-auto flex items-center justify-center space-x-2">
                      <span className="text-purple-500 text-xl font-['Share_Tech_Mono']">Let's go</span>
                      <span className="transform group-hover:translate-x-1 transition-transform text-purple-500 text-xl">↗</span>
                    </div>
                  </div>
                </div>
              </a>
            </motion.div>

            {/* Superbridge Card */}
            <motion.div variants={itemVariants} className="group relative">
              <div className="tooltip opacity-0 group-hover:opacity-100 transition-all duration-300 absolute -top-24 left-1/2 transform -translate-x-1/2 bg-black/90 text-white text-sm font-['Share_Tech_Mono'] px-6 py-4 rounded-2xl border border-emerald-500/30 backdrop-blur-xl z-50 shadow-lg shadow-emerald-500/20 w-[90%]">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-emerald-400">🚀</span>
                    <span className="font-bold">Beginner Friendly:</span>
                  </div>
                  <ul className="text-gray-300 space-y-2 text-sm list-disc list-inside">
                    <li>One-click bridging process</li>
                    <li>Real-time transaction status</li>
                    <li>Simplified interface</li>
                    <li>Automatic gas optimization</li>
                  </ul>
                </div>
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-black/90 border-r border-b border-emerald-500/30 rotate-45"></div>
              </div>
              <div className="absolute -inset-[1px] bg-gradient-to-r from-emerald-500/50 via-teal-500/50 to-emerald-500/50 rounded-xl blur-md group-hover:blur-xl transition-all duration-300 opacity-20 group-hover:opacity-30"></div>
              <a href="https://superbridge.app/base" target="_blank" rel="noopener noreferrer" className="block">
                <div className="aspect-square bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-emerald-500/30 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-emerald-500/20 p-8 relative">
                  {/* Background Image */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent">
                    <Image
                      src="/super.jpg"
                      alt=""
                      fill
                      className="object-contain opacity-20 scale-[2] blur-lg"
                      quality={100}
                      priority
                    />
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl blur-xl"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex-grow flex flex-col items-center justify-center text-center space-y-4">
                      <Image
                        src="/super.jpg"
                        alt="Superbridge Logo"
                        width={120}
                        height={120}
                        quality={100}
                        priority
                        className="object-contain"
                      />
                      <h2 className="text-4xl font-['Share_Tech_Mono'] grid-title group-hover:text-emerald-500">Superbridge</h2>
                      <p className="text-gray-400 text-lg font-['Share_Tech_Mono']">By Blob Engineering</p>
                    </div>
                    <div className="mt-auto flex items-center justify-center space-x-2">
                      <span className="text-emerald-500 text-xl font-['Share_Tech_Mono']">Let's go</span>
                      <span className="transform group-hover:translate-x-1 transition-transform text-emerald-500 text-xl">↗</span>
                    </div>
                  </div>
                </div>
              </a>
            </motion.div>
          </div>

          {/* Disclaimer */}
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-500 font-['Share_Tech_Mono']">
              SPHERE provides links to these independent bridge services for your convenience but assumes no responsibility for their operations. 
              Any interactions with these providers are solely between you and the provider.
            </p>
          </div>

          {/* FAQ Section */}
          <div className="mt-20 max-w-3xl mx-auto">
            <h2 className="text-3xl font-['Share_Tech_Mono'] text-center text-[#0052FF] mb-10">Frequently Asked Questions</h2>
            
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <motion.div 
                  key={index}
                  className="group"
                  initial={false}
                >
                  <motion.div 
                    className={`bg-black/50 backdrop-blur-xl rounded-xl border overflow-hidden transition-all duration-300 ${
                      openFaq === index 
                        ? 'border-[#0052FF] shadow-lg shadow-[#0052FF]/20' 
                        : 'border-[#0052FF]/30 hover:border-[#0052FF]/50'
                    }`}
                  >
                    <button 
                      onClick={() => setOpenFaq(openFaq === index ? null : index)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left group"
                    >
                      <span className={`font-['Share_Tech_Mono'] transition-colors duration-300 ${
                        openFaq === index ? 'text-[#0052FF]' : 'text-white group-hover:text-[#0052FF]/80'
                      }`}>
                        {item.question}
                      </span>
                      <span className={`text-[#0052FF] transition-transform duration-300 ${
                        openFaq === index ? 'rotate-180' : ''
                      }`}>▼</span>
                    </button>
                    <motion.div 
                      initial={false}
                      animate={{
                        height: openFaq === index ? 'auto' : 0,
                        opacity: openFaq === index ? 1 : 0
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut"
                      }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-4 text-gray-400 font-['Share_Tech_Mono']">
                        {item.answer}
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 