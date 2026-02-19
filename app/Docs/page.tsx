'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import OnchainkitSvg from '../svg/OnchainKit';

// This is a client-side component that renders a list of documentation
// and provides navigation to specific docs
export default function DocsPage() {
  const router = useRouter();

  const navigateToDoc = (path: string) => {
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8 flex-grow">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-8">MySphere Documentation</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            {/* Whitepaper Card */}
            <div 
              onClick={() => window.open('/mysphere-whitepaper-english.html', '_blank')}
              className="bg-gray-900 border border-[#0052FF]/20 rounded-lg p-6 hover:border-[#0052FF] transition-all cursor-pointer"
            >
              <h2 className="text-2xl font-bold mb-4">MySphere Whitepaper</h2>
              <p className="text-gray-400 mb-4">
                Comprehensive overview of the MySphere platform, including our vision, 
                technology stack, tokenomics, and roadmap.
              </p>
              <div className="flex justify-between items-center mt-6">
                <span className="text-[#0052FF]">View Whitepaper</span>
                <span className="text-gray-500 text-sm">Version 1.0</span>
              </div>
            </div>
            
            {/* API Documentation Card */}
            <div 
              className="bg-gray-900 border border-[#0052FF]/20 rounded-lg p-6 hover:border-[#0052FF] transition-all cursor-pointer opacity-50"
            >
              <h2 className="text-2xl font-bold mb-4">API Documentation</h2>
              <p className="text-gray-400 mb-4">
                Technical documentation for developers looking to integrate with the 
                MySphere platform and ecosystem. 
              </p>
              <div className="flex justify-between items-center mt-6">
                <span className="text-[#0052FF]">Coming Soon</span>
                <span className="text-gray-500 text-sm">In Development</span>
              </div>
            </div>
            
            {/* User Guide Card */}
            <div 
              className="bg-gray-900 border border-[#0052FF]/20 rounded-lg p-6 hover:border-[#0052FF] transition-all cursor-pointer opacity-50"
            >
              <h2 className="text-2xl font-bold mb-4">User Guide</h2>
              <p className="text-gray-400 mb-4">
                Step-by-step instructions for using MySphere platform features, 
                from account creation to NFT minting.
              </p>
              <div className="flex justify-between items-center mt-6">
                <span className="text-[#0052FF]">Coming Soon</span>
                <span className="text-gray-500 text-sm">In Development</span>
              </div>
            </div>
          </div>
          
          <div className="mt-16 flex justify-center">
            <Link 
              href="/"
              className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-[#0052FF] hover:bg-[#0052FF]/80"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </div>
      
      {/* Footer moved to bottom, styled like the main page footer */}
      <div className="relative z-10 border-t border-gray-800 py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          {/* Sphere logo po lewej */}
          <div className="flex items-center mb-4 md:mb-0">
            <Image
              src="/elo2.png"
              alt="SPHERE"
              width={80}
              height={24}
              className="h-6 w-auto opacity-70 hover:opacity-100 transition-opacity"
            />
          </div>

          {/* Base logo na środku */}
          <div className="md:absolute md:left-1/2 md:transform md:-translate-x-1/2 mb-4 md:mb-0">
            <Link href="https://base.org" target="_blank" className="opacity-70 hover:opacity-100 transition-opacity">
              <Image 
                src="/brand-kit/base/logo/wordmark/Base_Wordmark_White.png"
                alt="Base Logo"
                width={60}
                height={24}
                className="h-6 w-auto"
              />
            </Link>
          </div>
          
          {/* Copyright i built with po prawej */}
          <div className="text-sm text-gray-500 flex items-center">
            <span>© 2024 mySphere.fun - Built with</span>
            <Link href="https://github.com/coinbase/onchainkit" target="_blank" className="ml-2 inline-flex items-center hover:opacity-90 transition-opacity">
              <OnchainkitSvg className="w-20 h-4 text-[#0052FF]/80 hover:text-[#0052FF] transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 