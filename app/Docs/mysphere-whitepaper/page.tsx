'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export default function MySphereWhitepaper() {
  const [activeSection, setActiveSection] = useState('executive-summary');
  const pathname = usePathname();

  // Effect to automatically set active section based on URL fragment
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setActiveSection(hash);
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [pathname]);

  // Handle navigation click
  const handleNavClick = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      window.history.pushState(null, '', `#${sectionId}`);
    }
  };

  return (
    <>
      {/* Global styles for font */}
      <style jsx global>{`
        @font-face {
          font-family: 'Coinbase Display';
          src: url('/brand-kit/base/fonts/Coinbase-Display/Coinbase_Display-Medium-web-1.32.woff2') format('woff2');
          font-weight: 500;
          font-style: normal;
          font-display: swap;
        }
        
        .docs-container * {
          font-family: 'Coinbase Display', -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen,
            Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
        }
      `}</style>
      
      <div className="flex flex-col lg:flex-row min-h-screen bg-black text-white overflow-x-hidden docs-container">
        {/* Sidebar/Navigation */}
        <div className="w-full lg:w-64 lg:fixed lg:h-screen bg-black border-r border-[#0052FF]/20 flex flex-col z-10">
          <div className="p-2 flex-grow overflow-y-auto">
            <h1 className="text-xl font-bold mb-2">MySphere Docs</h1>
            
            <nav className="space-y-0">
              <div>
                <h2 className="text-lg font-semibold mt-2 mb-1">Whitepaper</h2>
                <ul className="space-y-0 pl-2">
                  <li>
                    <button 
                      onClick={() => handleNavClick('executive-summary')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'executive-summary' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Executive Summary
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('introduction')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'introduction' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Introduction
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('market-analysis')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'market-analysis' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Market Analysis
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('platform-overview')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'platform-overview' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Platform Overview
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('technical-architecture')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'technical-architecture' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Technical Architecture
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('token-economics')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'token-economics' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Token Economics
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('reputation-system')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'reputation-system' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Reputation System
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('business-model')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'business-model' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Business Model
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('team')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'team' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Team & Advisors
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('roadmap')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'roadmap' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Roadmap
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => handleNavClick('conclusion')}
                      className={`w-full text-left px-2 py-1 rounded ${activeSection === 'conclusion' ? 'bg-[#0052FF] text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Conclusion
                    </button>
                  </li>
                </ul>
              </div>
            </nav>
          </div>
          
          {/* Footer with logo */}
          <div className="p-2 border-t border-[#0052FF]/20 mt-auto bg-black/80 mb-4">
            <div className="flex items-center justify-center">
              <Image 
                src="/favicon_io (1)/android-chrome-512x512.png" 
                alt="MySphere" 
                width={30} 
                height={30}
                className="opacity-100"
                priority
              />
            </div>
          </div>
      </div>

      {/* Main Content */}
        <div className="w-full lg:ml-64 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto relative">
          <h1 className="text-4xl font-bold mb-2">MY SPHERE</h1>
          <h2 className="text-2xl mb-6">The Onchain Dapp Web3 Social Platform</h2>
          <p className="italic mb-8">Revolutionizing Content Creation and Monetization through Blockchain Technology</p>
          
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">WHITEPAPER</h2>
            <p className="font-semibold">Version 1.0 - March 2025</p>
          </div>

          {/* Executive Summary */}
          <section id="executive-summary" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">1. EXECUTIVE SUMMARY</h2>
            <p className="mb-4">
              MySphere.fun is a revolutionary Web3 social platform that combines traditional social media functionalities with blockchain technology. Our platform enables users to create, tokenize, and monetize content as NFTs, while building a decentralized reputation system on the Base blockchain.
            </p>
            <p className="mb-4">
              Leveraging the full capabilities of the onchainkit framework, mySphere.fun offers a seamless user experience that makes Web3 technologies accessible to mainstream users while providing the benefits of blockchain-based ownership, monetization opportunities, and data sovereignty.
            </p>
            <p className="mb-4">
              The platform currently focuses on two main types of content bringing together builders from the Base network: onchain posts and crypto quotes, which can be minted as unique NFTs with provable ownership and transferable value. Our onchain reputation system incentivizes quality content creation and positive community engagement, creating a self-sustaining ecosystem that rewards valuable contributions.
            </p>
            <p className="mb-4">
              This whitepaper outlines our vision, technology stack, economic model, and development roadmap as we build toward becoming the preeminent social platform in the Web3 space.
            </p>
          </section>

          {/* Introduction */}
          <section id="introduction" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">2. INTRODUCTION</h2>
            
            <h3 className="text-xl font-semibold mt-6 mb-3">2.1 Vision</h3>
            <p className="mb-4">
              The social media landscape has evolved dramatically over the past decade, yet the fundamental model remains unchanged: centralized platforms extract value from user-generated content while maintaining complete control over data, monetization, and platform rules. This model has led to numerous issues related to content ownership, creator compensation, platform censorship, and data privacy.
            </p>
            <p className="mb-4">
              mySphere.fun aims to disrupt this paradigm by introducing a decentralized social platform where:
            </p>
            <ul className="list-disc ml-6 mb-4 space-y-1">
              <li>Users store their content onchain</li>
              <li>Creators can directly monetize their content without intermediaries</li>
              <li>Reputation is built transparently on-chain based on community validation</li>
              <li>User data sovereignty is preserved through blockchain technology</li>
              <li>Community governance shapes platform development</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">2.2 Problem</h3>
            <p className="mb-4">
              The current social media landscape presents several challenges:
            </p>
            <ol className="list-decimal ml-6 mb-4 space-y-2">
              <li><strong>Content Ownership</strong>: Creators lack true ownership of their content, which can be modified, censored, or removed by platform authorities.</li>
              <li><strong>Value Extraction</strong>: Platform intermediaries capture a disproportionate share of the value created by content producers.</li>
              <li><strong>Monetization Barriers</strong>: Creators face high barriers to monetization, with platforms imposing strict eligibility requirements and taking substantial revenue cuts.</li>
              <li><strong>Opaque Reputation</strong>: Reputation systems are centralized, opaque, and subject to manipulation.</li>
              <li><strong>Data Control</strong>: Users have limited control over their personal data, which is harvested and monetized without fair compensation.</li>
              <li><strong>Web3 Usability Gap</strong>: Existing Web3 applications often present significant usability challenges, limiting mainstream adoption.</li>
            </ol>

            <h3 className="text-xl font-semibold mt-6 mb-3">2.3 Our Solution</h3>
            <p className="mb-4">
              mySphere.fun addresses these challenges by:
            </p>
            <ol className="list-decimal ml-6 mb-4 space-y-2">
              <li><strong>Content and NFT Ownership</strong>: Enabling users to tokenize posts and quotes as NFTs, establishing verifiable onchain ownership.</li>
              <li><strong>Direct Monetization</strong>: Allowing creators to sell their content directly to buyers without platform intermediaries.</li>
              <li><strong>Onchain Reputation</strong>: Building a transparent reputation system based on onchain activity and community validation.</li>
              <li><strong>Base Integration</strong>: Leveraging the Base blockchain for efficient transaction management and data storage.</li>
              <li><strong>Simplified Web3 UX</strong>: Using onchainkit to create a user-friendly interface that abstracts away blockchain complexity.</li>
              <li><strong>Community Governance</strong>: Implementing progressive decentralization to give users a voice in platform development.</li>
            </ol>
          </section>

            {/* Market Analysis */}
          <section id="market-analysis" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">3. MARKET ANALYSIS</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">3.1 Target Market</h3>
              <p className="mb-4">mySphere.fun targets three primary user segments:</p>
              
              <ol className="list-decimal ml-6 mb-4 space-y-2">
                <li><strong>Content Creators</strong>: Writers, thought leaders, and social media influencers looking for new monetization channels and true content ownership.</li>
                <li><strong>Crypto Enthusiasts</strong>: Blockchain, Base network builders, and cryptocurrency enthusiasts interested in innovative Web3 applications and community building.</li>
                <li><strong>Digital Collectors</strong>: Individuals interested in collecting and trading digital assets with cultural or social significance.</li>
              </ol>
              
              <p className="mb-4">
                These segments represent a substantial and growing market. According to industry reports, there are over 300 million digital content creators worldwide, with the creator economy valued at over $100 billion. Meanwhile, the global NFT market is projected to reach $80 billion by 2025, signaling strong demand for tokenized digital assets.
              </p>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">3.2 Competitive Landscape</h3>
              <p className="mb-4">The Web3 social media space is still nascent but includes several notable competitors:</p>
              
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Traditional Social Platforms with Web3 Features</strong>: Major platforms experimenting with limited NFT and blockchain integrations.</li>
                <li><strong>Decentralized Social Networks</strong>: Emerging alternatives to traditional social media built on blockchain technology.</li>
                <li><strong>NFT Marketplaces</strong>: Platforms focused on the creation and trading of digital collectibles.</li>
                <li><strong>Web3 Content Platforms</strong>: Applications that enable content monetization through cryptocurrencies and NFTs.</li>
              </ul>
              
              <p className="mb-4">mySphere.fun differentiates itself through:</p>
              
              <ol className="list-decimal ml-6 mb-4 space-y-2">
                <li><strong>Integrated Experience</strong>: Seamlessly combining social media functionality with web3 capabilities in a unified platform.</li>
                <li><strong>Onchain Reputation</strong>: Implementing a comprehensive reputation system that incentivizes valuable contributions.</li>
                <li><strong>Base Optimization</strong>: Leveraging Base's scalability and low fees to provide an efficient user experience.</li>
                <li><strong>User-Friendly Interface</strong>: Prioritizing accessibility for mainstream users through intuitive design.</li>
                <li><strong>Specialized Content Focus</strong>: Initial focus on onchain posts for Base network builders provides a clear value proposition and target audience.</li>
              </ol>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">3.3 Market Trends</h3>
              <p className="mb-4">Several key trends support the mySphere.fun vision:</p>
              
              <ol className="list-decimal ml-6 mb-4 space-y-2">
                <li><strong>Growing Creator Economy</strong>: Increasing demand for direct creator monetization options and audience relationships.</li>
                <li><strong>Rising NFT Utility</strong>: Evolution of NFTs beyond collectibles toward utility and social applications.</li>
                <li><strong>Web3 Mainstream Adoption</strong>: Growing interest in blockchain applications among non-technical users.</li>
                <li><strong>Social Token Growth</strong>: Emergence of personal and community tokens as engagement and value capture mechanisms.</li>
                <li><strong>Data Sovereignty Movement</strong>: Growing consumer awareness and demand for control over personal data.</li>
              </ol>
          </section>

            {/* Platform Overview */}
          <section id="platform-overview" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">4. PLATFORM OVERVIEW</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">4.1 Key Features</h3>
              <p className="mb-4">mySphere.fun offers a comprehensive set of features designed to create a vibrant ecosystem for content creation, consumption, and monetization:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.1 Social Posts</h4>
              <p className="mb-4">
                Users can create standard social posts with text, links, and media, similar to traditional social platforms but with integrated Web3 capabilities. The platform offers advanced AI tools to generate and enhance posts, enabling the creation of professional content even for people without writing experience.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.2 Crypto Quotes</h4>
              <p className="mb-4">
                Specialized functionality for creating, discovering, and sharing notable quotes from the cryptocurrency and blockchain space, preserving important insights and memorable statements. Users can leverage AI to generate quotes based on market trends, industry news, or technical analyses.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.3 NFT Minting</h4>
              <p className="mb-4">
                One-click functionality to convert posts and quotes into NFTs, establishing provable ownership and enabling monetization.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.4 NFT Marketplace</h4>
              <p className="mb-4">
                Integrated marketplace for buying, selling, and trading tokenized content with support for various pricing models (fixed price, auction, etc.).
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.5 User Profiles</h4>
              <p className="mb-4">
                Enhanced profiles displaying both traditional social metrics and onchain reputation, NFT collections, and activity history.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.6 Discovery Feed</h4>
              <p className="mb-4">
                Personalized content discovery incorporating user preferences, trending content, and reputation-weighted recommendations.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.7 Onchain Reputation</h4>
              <p className="mb-4">
                Comprehensive reputation system tracking contributions, engagement quality, content popularity, and market value of created NFTs.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.8 Social Graph</h4>
              <p className="mb-4">
                Relationship mapping enabling follows, collaborations, and content curation between users.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.9 Wallet Integration</h4>
              <p className="mb-4">
                Seamless connection with popular Web3 wallets for transaction management and identity verification.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.10 Finance - $AIS Token Support</h4>
              <p className="mb-4">
                The platform enables purchase and use of the $AIS token utilities, the official token of the MySphereAI creator, used for managing platform promotion. It's important to note that $AIS is not the official token of the mySphere.fun platform itself, but offers additional possibilities for users interested in the expanded ecosystem.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.11 Bridge to Base</h4>
              <p className="mb-4">
                Integrated bridge functionality enabling easy asset transfers between different blockchains and the Base network, providing liquidity and flexibility for users with assets on various chains.
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.1.12 Morpho Vault</h4>
              <p className="mb-4">
                Vault functionality integrated with the Morpho protocol, allowing users to save by holding USDC in secure vaults, providing additional passive income opportunities without leaving the platform ecosystem.
              </p>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">4.2 User Journey</h3>
              <p className="mb-4">The typical user journey on mySphere.fun follows these steps:</p>
              
              <ol className="list-decimal ml-6 mb-4 space-y-2">
                <li><strong>Account Creation</strong>: Users connect their Web3 wallet or create a new Coinbase Smart Wallet through our simplified onboarding process.</li>
                <li><strong>Profile Setup</strong>: Users establish their digital identity by customizing their profile and connecting relevant social accounts.</li>
                <li><strong>Content Exploration</strong>: New users discover content and creators through the personalized feed and topic-based exploration.</li>
                <li><strong>Initial Engagement</strong>: Users begin interacting with content through likes, comments, and shares, building initial reputation.</li>
                <li><strong>Content Creation</strong>: Users create their first onchain posts, contributing to the platform ecosystem.</li>
                <li><strong>NFT Minting</strong>: After creating valuable content, users can tokenize their own as well as popular quotes as NFTs, establishing ownership and value.</li>
                <li><strong>Marketplace Participation</strong>: Users can list their NFTs for sale or purchase content from other creators.</li>
                <li><strong>Reputation Building</strong>: Through consistent quality contributions and positive community engagement, users build their onchain reputation.</li>
                <li><strong>Community Involvement</strong>: Established users can participate in governance discussions and platform development initiatives.</li>
              </ol>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">4.3 Use Cases</h3>
              <p className="mb-4">mySphere.fun supports various use cases for different stakeholders:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.3.1 Content Creators</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Publishing posts directly on the blockchain (onchain) ensuring permanence and immutability of content</li>
                <li>Using advanced AI tools to generate, enhance, and personalize content</li>
                <li>Building verifiable reputation based on the quality of published content</li>
                <li>Direct monetization of content through various mechanisms, including optional NFT tokenization</li>
                <li>Establishing direct relationships with audiences without intermediaries</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.3.2 Curators and AI Enthusiasts</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Discovering and promoting valuable content generated by humans and AI</li>
                <li>Experimenting with different AI models to create unique posts and quotes</li>
                <li>Building reputation through high-quality curation and selection of appropriate AI models</li>
                <li>Creating specialized AI prompts for generating content on specific topics</li>
                <li>Collaborating with creators to produce high-quality AI-assisted content</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.3.3 Crypto Analysts and Researchers</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Publishing analyses and insights about the cryptocurrency market preserved on the blockchain</li>
                <li>Using AI to analyze trends and generate market forecasts</li>
                <li>Preserving important statements and moments in cryptocurrency history</li>
                <li>Creating chronological collections documenting industry evolution</li>
                <li>Building knowledge repositories verified by the community</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.3.4 Web3 Communities and Projects</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Creating dedicated discussion spaces with onchain recording for increased transparency</li>
                <li>Automatically generating summaries and syntheses of discussions using AI</li>
                <li>Building community reputation through collective contributions and interactions</li>
                <li>Managing project communication with automatic onchain recording</li>
                <li>Using AI for translation and adapting communication to different audiences</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">4.3.5 AI Developers and Innovators</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Testing new models and AI applications in a social environment</li>
                <li>Creating custom AI tools for specific use cases</li>
                <li>Improving existing models based on real social interactions</li>
                <li>Building advanced applications based on the platform API</li>
                <li>Experimenting with hybrid human-AI interactions in a social context</li>
              </ul>
          </section>

            {/* Technical Architecture */}
          <section id="technical-architecture" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">5. TECHNICAL ARCHITECTURE</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">5.1 Technology Stack</h3>
              <p className="mb-4">MySphere AI is built on an advanced technology stack that effectively combines Web3 technologies with modern web development:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.1.1 Blockchain Layer</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Base Network</strong>: Fundamental blockchain infrastructure with integration through OnchainKit and Coinbase SDK</li>
                <li><strong>Web3 Integration</strong>: Complete system for interacting with contracts using WalletConnect and dedicated APIs</li>
                <li><strong>IPFS Storage</strong>: Decentralized data storage through Pinata and Infura IPFS for long-term persistence</li>
                <li><strong>Smart Contracts</strong>: Custom contracts for NFT operations, marketplace functionality, and reputation tracking</li>
                <li><strong>onchainkit Integration</strong>: Comprehensive use of onchainkit components for seamless Base blockchain interaction</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.1.2 Application Layer</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>React/Next.js</strong>: Advanced frontend framework with optimal rendering and routing</li>
                <li><strong>Tailwind CSS</strong>: Utility-class based design system for consistent user interface</li>
                <li><strong>Multi-cloud backend</strong>: Architecture utilizing Firebase (auth, database, storage), Vercel Blob for scalable data storage, and Google Cloud Services</li>
                <li><strong>Frontend</strong>: Modern JavaScript framework with responsive design for cross-device compatibility</li>
                <li><strong>Backend</strong>: Advanced Node.js architecture with Express framework, RESTful API endpoints, and real-time data processing capabilities. Uses multiple data storage solutions and dedicated microservices for different platform functionalities.</li>
                <li><strong>Storage</strong>: Hybrid solution combining decentralized storage (IPFS) for NFT content with traditional databases for application data</li>
                <li><strong>Authentication</strong>: Web3 wallet integration with optional email-based account recovery</li>
                <li><strong>AI Agent</strong>: System automating tokenization processes and launching new tokens (Token Launcher)</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.1.3 Core Technology Modules</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>DeFi Integration</strong>: Advanced APIs for market data through Coingecko and Dune Analytics</li>
                <li><strong>AI Processing</strong>: Multi-model AI processing using OpenAI, DeepSeek, and OpenRouter</li>
                <li><strong>Media Enrichment</strong>: Processing and delivering multimedia content from Unsplash and Pexels</li>
                <li><strong>Social Connectivity</strong>: Integration with external social networks, especially X (Twitter)</li>
                <li><strong>Indexing</strong>: Custom indexers for efficient onchain data retrieval and analytics</li>
                <li><strong>Caching</strong>: Multi-level caching strategy minimizing blockchain reads and optimizing performance</li>
                <li><strong>CDN</strong>: Content delivery network for media optimization</li>
                <li><strong>Quotable API</strong>: Integration for accessing and generating inspirational quotes</li>
                <li><strong>Firebase Ecosystem</strong>: Comprehensive suite of tools including Authentication, Realtime Database, Cloud Storage, and Analytics</li>
                <li><strong>Vercel Blob Storage</strong>: High-performance blob storage for media and large content files</li>
                <li><strong>Pinata IPFS Gateway</strong>: Professional IPFS pinning service ensuring content persistence</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.1.4 Advanced Technologies</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Wallet-as-identity</strong>: Authentication based on cryptographic wallets with optional traditional methods</li>
                <li><strong>Chainlink VRF</strong>: Verified randomness for processes requiring transparent entropy</li>
                <li><strong>Smart contract infrastructure</strong>: Dedicated contracts for MySphere</li>
                <li><strong>Security layer</strong>: Comprehensive application protection using reCAPTCHA and advanced authentication mechanisms</li>
                <li><strong>MySphere</strong>: Integrates advanced APIs and cloud services creating a comprehensive Web3 platform ready for scaling, while ensuring high performance and security.</li>
                <li><strong>Coinbase SDK</strong>: Secure wallet integration and cryptocurrency transaction management</li>
                <li><strong>WalletConnect</strong>: Standardized protocol for connecting decentralized applications to mobile wallets</li>
                <li><strong>Google Cloud Services</strong>: Enterprise-grade infrastructure for backend operations and scaling</li>
                <li><strong>Infura IPFS & Base Endpoints</strong>: Reliable infrastructure for blockchain and IPFS connectivity</li>
                <li><strong>Three.js</strong>: Advanced 3D rendering library for immersive visual experiences</li>
                <li><strong>Web3 Authentication</strong>: Multiple authentication methods including wallet-based (Coinbase, MetaMask) and traditional options</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">5.2 Smart Contract Architecture</h3>
              <p className="mb-4">MySphere utilizes a modular smart contract system with the following key components:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.2.1 Content Contracts</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>PostNFT</strong>: Contract handling content management based on posts</li>
                <li><strong>QuoteNFT</strong>: Specialized contract for quote-based NFTs with attribution mechanisms</li>
                <li><strong>ContentRegistry</strong>: System for mapping and indexing content published by users</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.2.2 GameFi Contracts (in preparation)</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>BaseMorningGame</strong>: Flagship game contract embedded in the Base ecosystem</li>
                <li><strong>RewardDistributor</strong>: Management of reward system and token distribution for activity</li>
                <li><strong>StakingVault</strong>: Staking mechanism enabling passive earning from platform assets</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.2.3 Infrastructure Contracts (in preparation)</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>ProfileManager</strong>: Main contract managing user identity and profile data</li>
                <li><strong>ChainlinkVRF</strong>: Integration with verified random number generator for transparent random mechanisms</li>
                <li><strong>CrossChainBridge</strong>: Solution enabling interoperability between different blockchain networks</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">5.3 Data Management</h3>
              <p className="mb-4">mySphere.fun employs a sophisticated data management strategy that balances decentralization with performance:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.3.1 On-Chain Data</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>NFT ownership records</li>
                <li>Transaction history</li>
                <li>Core reputation metrics</li>
                <li>Governance votes and proposals</li>
                <li>Content verification status</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.3.2 Off-Chain Data</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Content media (IPFS-stored with on-chain references)</li>
                <li>Extended metadata</li>
                <li>User preferences</li>
                <li>Application state</li>
                <li>Analytics and engagement metrics</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">5.3.3 Data Indexing</h4>
              <p className="mb-4">Custom indexing solutions ensure efficient data retrieval for:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>User activity timelines</li>
                <li>Reputation score calculations</li>
                <li>Content discovery algorithms</li>
                <li>Marketplace analytics</li>
                <li>Trending content identification</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">5.4 Security Considerations</h3>
              <p className="mb-4">mySphere.fun prioritizes security through:</p>
              
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Formal verification of critical contract components</li>
                <li>Comprehensive testing protocols for all platform updates</li>
                <li>Bug bounty program for community-driven security improvements</li>
                <li>Phased rollout of new features to minimize risk exposure</li>
                <li>Educational resources helping users maintain wallet security</li>
                <li>Optional transaction signing confirmations for high-value operations</li>
                <li>Audits (in discussions with professional audit firms)</li>
              </ul>
          </section>

            {/* Token Economics */}
          <section id="token-economics" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">6. TOKEN ECONOMICS</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">6.1 NFT Implementation</h3>
              <p className="mb-4">MySphere implements a specialized NFT standard optimized for social content with the following characteristics:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.1.1 Content NFT Structure</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Metadata</strong>: Rich metadata including content type, creation timestamp, creator information, and content hash</li>
                <li><strong>Media Storage</strong>: IPFS-based storage with content addressing for immutability</li>
                <li><strong>Versioning</strong>: Support for content updates while maintaining provenance record</li>
                <li><strong>Fractionalization</strong>: Optional functionality for shared ownership of high-value content</li>
                <li><strong>Composability</strong>: Ability to reference and build upon existing content NFTs</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.1.2 NFT Properties</h4>
              <p className="mb-4">Each mySphere NFT includes:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Permanent link to original content</li>
                <li>Creator attribution that persists through transfers</li>
                <li>Reputation context at time of creation</li>
                <li>Optional programmable traits for specialized functionality</li>
                <li>Ability to unlock new features in the MySphere ecosystem</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.1.3 SPHERE NFT Collection</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>SPHERE Pioneer</strong>: Basic level of access to the ecosystem with limited supply of 2500 tokens, providing early benefits and future rewards for early users</li>
                <li><strong>SPHERE Guardian</strong>: Medium level with limited number of 1500 tokens, providing advanced features, priority access to new features, and membership in an elite group of platform guardians</li>
                <li><strong>SPHERE Master</strong>: Highest level in the hierarchy with a limited pool of only 1000 tokens, offering full access to all features, exclusive VIP privileges, and participation in key decisions</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.1.4 Value Mechanism and Benefits</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Strictly Limited Supply</strong>: A total of only 5000 SPHERE NFT tokens across all levels, guaranteeing long-term scarcity</li>
                <li><strong>Progressive Privileges</strong>: Higher NFT levels unlock increasingly more exclusive features and capabilities</li>
                <li><strong>Transferable Benefits</strong>: Privileges associated with tokens are transferred with NFT ownership, creating market value</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.1.5 Community Development Strategy</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Exclusive Events</strong>: Access to special events only for holders of selected NFT levels</li>
                <li><strong>Rewards Program</strong>: Dedicated reward system proportional to the level of SPHERE token held</li>
                <li><strong>Development Influence</strong>: Ability to shape the future of the platform, increasing with the token level</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">6.2 Market Mechanics</h3>
              <p className="mb-4">The integrated marketplace facilitates various transaction types:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.2.1 Pricing Models</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Fixed price listings</li>
                <li>Timed auctions</li>
                <li>Dutch auctions</li>
                <li>Collection bundles</li>
                <li>Private sales</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.2.2 Revenue Streams</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Primary sale proceeds (creator)</li>
                <li>Secondary sale royalties (original creator)</li>
                <li>Platform fees (ecosystem sustainability)</li>
                <li>Curation rewards (content discoverers)</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.2.3 Transaction Processing</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Low-fee transactions through Base optimization</li>
                <li>Optional prioritization for time-sensitive transactions</li>
                <li>Batch processing for gas efficiency</li>
                <li>Gasless transactions for specific platform activities</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">6.3 Platform Token (Future Implementation)</h3>
              <p className="mb-4">While not part of the initial release, mySphere.fun plans to introduce a utility token with the following functions:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.3.1 Token Utility</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Governance participation</li>
                <li>Premium feature access</li>
                <li>Fee discounts</li>
                <li>Reputation amplification</li>
                <li>Staking rewards</li>
                <li>Curation incentives</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.3.2 Token Distribution</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Community airdrops</li>
                <li>Creator rewards</li>
                <li>Early adopter incentives</li>
                <li>Development fund</li>
                <li>Ecosystem grants</li>
                <li>Liquidity provisions</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">6.3.3 Tokenomics</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Fixed maximum supply</li>
                <li>Deflationary mechanisms through platform fee burning</li>
                <li>Gradual distribution curve rewarding long-term participation</li>
                <li>Lock-up periods for team and investor allocations</li>
              </ul>
          </section>

            {/* Reputation System */}
          <section id="reputation-system" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">7. ONCHAIN REPUTATION SYSTEM</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">7.1 Reputation Framework</h3>
              <p className="mb-4">The MySphere reputation system combines on-chain and off-chain signals to create a comprehensive trustworthiness metric:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">7.1.1 Reputation Components</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Content Quality</strong>: Measured through engagement, collections, and market value</li>
                <li><strong>Community Contributions</strong>: Participation in discussions, curation, and governance</li>
                <li><strong>Market Activity</strong>: History of fair trading, fulfilling commitments, and market integrity</li>
                <li><strong>Account History</strong>: Account age, consistency of activity, and network connections</li>
                <li><strong>Verification Status</strong>: Optional KYC and identity verification levels</li>
                <li><strong>Base Scan API</strong>: Measured through transactions, collections, smart contracts, market value, and tokens on the Base address</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">7.1.2 Reputation Calculation</h4>
              <p className="mb-4">Reputation scores are calculated using a multi-factorial algorithm that:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Weights signals based on their reliability and importance</li>
                <li>Adjusts for potential manipulation attempts</li>
                <li>Normalizes across different user activity levels</li>
                <li>Incorporates time decay for historical activities</li>
                <li>Provides context-specific reputation for different platform areas</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">7.2 Reputation Rewards</h3>
              <p className="mb-4">Users build reputation through positive contributions and can benefit in several ways:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">7.2.1 Tangible Benefits</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Increased visibility in search and discovery</li>
                <li>Access to exclusive platform features</li>
                <li>Reduced marketplace fees</li>
                <li>Priority processing for transactions</li>
                <li>Special creator tools and capabilities</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">7.2.2 Social Benefits</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Reputation badges displayed on profile</li>
                <li>Achievement milestones and recognitions</li>
                <li>Influence in trending content algorithms</li>
                <li>Authority status in specific content categories</li>
                <li>Governance voting power (future implementation)</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">7.3 Anti-Manipulation Measures</h3>
              <p className="mb-4">To maintain reputation system integrity, mySphere.fun implements:</p>
              
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Sybil-resistance mechanisms to prevent fake account manipulation</li>
                <li>Activity pattern analysis to identify artificial engagement</li>
                <li>Stake-based actions for high-impact reputation contributions</li>
                <li>Decaying impact of repeated interactions from the same sources</li>
                <li>Community reporting and moderation for suspicious activity</li>
                <li>Transparent reputation calculation with appeal mechanisms</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">7.4 Reputation Portability</h3>
              <p className="mb-4">mySphere.fun is designed with reputation portability in mind:</p>
              
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Verifiable reputation credentials exportable to other platforms</li>
                <li>Support for cross-platform reputation aggregation</li>
                <li>Open API for authorized reputation data access</li>
                <li>Integration with emerging decentralized identity standards</li>
                <li>Participation in cross-platform reputation consortiums</li>
              </ul>
          </section>

            {/* Business Model */}
          <section id="business-model" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">8. BUSINESS MODEL</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">8.1 Revenue Streams</h3>
              <p className="mb-4">MySphere implements a sustainable business model with multiple revenue sources:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.1.1 Primary Revenue Streams</h4>
              
              <p className="font-medium mb-2">Market Fees:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Small percentage fee on NFT sales transactions (2-5%)</li>
                <li>Small percentage fee on token creation in Spherian AGENT</li>
                <li>Small percentage on currency/token exchange in the swap module</li>
                <li>Sales of SPHERE NFT collection</li>
                <li>Paid access to exclusive content/events</li>
                <li>Monetization systems for creators (with platform commission)</li>
                <li>Revenues from staking pool operations</li>
                <li>Commissions from earn/yield farming features</li>
                <li>Fees for access to advanced financial products</li>
              </ul>
              
              <p className="font-medium mb-2">Partnerships and Integrations:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Collaboration with blockchain projects and brands</li>
                <li>Affiliate program for ecosystem developers</li>
                <li>White-label solutions for businesses</li>
              </ul>
              
              <p className="font-medium mb-2">AI Services:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Paid access to advanced AI features</li>
                <li>Personalized bots and AI assistants</li>
                <li>Generative tools for content creators</li>
              </ul>
              
              <p className="font-medium mb-2">Contextual Advertisements:</p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Privacy-respecting targeted ads</li>
                <li>Sponsored content and promotions</li>
                <li>Partnerships with cryptocurrency projects</li>
              </ul>
              
              <p className="mb-4">
                <strong>Premium Features</strong>: Subscription access to advanced tools for creators and collectors<br />
                <strong>Promoted Content</strong>: Curated and clearly labeled promotional opportunities
              </p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.1.2 Secondary Revenue Opportunities</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Enterprise Solutions</strong>: Customized implementations for businesses and organizations</li>
                <li><strong>Education & Training</strong>: Resources for creators looking to maximize platform value</li>
                <li><strong>Exclusive Collections</strong>: Platform-curated collections with revenue sharing</li>
                <li><strong>Integration Partnerships</strong>: Strategic integrations with complementary services</li>
                <li><strong>Data Insights</strong>: Anonymized trend analysis for industry partners</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">8.2 Value Distribution</h3>
              <p className="mb-4">MySphere is committed to fair value distribution among ecosystem participants:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.2.1 Creator Focus</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Creators retain 95-98% of primary sales revenue</li>
                <li>Customizable royalties on secondary sales (5-10% standard)</li>
                <li>Additional incentives for high-reputation creators</li>
                <li>Bonus distributions for viral or culturally significant content</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.2.2 Community Rewards</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Curation rewards for discovering valuable content</li>
                <li>Engagement incentives for constructive participation</li>
                <li>Governance rewards for protocol improvements</li>
                <li>Bug bounties and security contributions</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.2.3 Platform Sustainability</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Operational expense coverage</li>
                <li>Continuous development funding</li>
                <li>Security maintenance and audits</li>
                <li>Community growth initiatives</li>
                <li>Protocol upgrades and optimization</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">8.3 Growth Strategy</h3>
              <p className="mb-4">MySphere will pursue growth through a multi-faceted approach:</p>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.3.1 User Acquisition</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Strategic partnerships with existing Web3 communities</li>
                <li>Creator onboarding programs with incentives</li>
                <li>Educational content for Web3 newcomers</li>
                <li>Referral systems with reputation and token rewards</li>
                <li>Targeted outreach to crypto-oriented audiences initially</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.3.2 Retention Strategies</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Regular feature enhancements based on user feedback</li>
                <li>Community building through events and challenges</li>
                <li>Progressive reputation benefits encouraging ongoing activity</li>
                <li>Personalization improvements to enhance user experience</li>
                <li>Compelling tokenomics incentivizing long-term participation</li>
              </ul>
              
              <h4 className="text-lg font-semibold mt-4 mb-2">8.3.3 Network Effects</h4>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Multi-sided marketplace benefits for creators and collectors</li>
                <li>Increased platform value with growing content library</li>
                <li>Enhanced content discovery with larger user base</li>
                <li>Strengthened reputation system with increased participation</li>
                <li>Greater liquidity in the marketplace with expanded activity</li>
              </ul>
          </section>

            {/* Team & Advisors */}
          <section id="team" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">9. TEAM & ADVISORS</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">9.1 Core Team</h3>
              <p className="mb-4">MySphere is a project developed by a one-person multidisciplinary team Story91.base.eth, combining competencies from key areas:</p>
              
              <p className="mb-4">
                <strong>Founder and lead developer</strong>: Multifunctional specialist responsible for all aspects of the project, combining:
              </p>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Experience in Web3 application development and social platform design</li>
                <li>Specialized knowledge in blockchain architecture and NFT development</li>
                <li>Digital product management skills</li>
                <li>Strategic approach to community building in the Web3 ecosystem</li>
                <li>Competencies in smart contract programming with emphasis on security and performance</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">9.2 Advisors</h3>
              <p className="mb-4">Our advisory board includes industry leaders providing strategic guidance:</p>
              
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Blockchain Advisor</strong>: [Onbboarding] - Expertise in Layer 2 scaling solutions and Base ecosystem</li>
                <li><strong>Creator Economy Advisor</strong>: [Onbonrding] - Background in creator monetization platforms</li>
                <li><strong>Community Growth Lead</strong>: [0xbabs.base.eth] - Specialist in blockchain user experience simplification</li>
                <li><strong>Legal & Compliance Advisor</strong>: [Onboarding] - Regulatory expertise in digital assets</li>
                <li><strong>Tokenomics Advisor</strong>: [Onboarding] - Experience designing sustainable token economies</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">9.3 Partnerships</h3>
              <p className="mb-4">MySphere has established strategic partnerships to accelerate development and adoption:</p>
              
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li><strong>Base Ecosystem Partners</strong>: Collaboration with Base ecosystem projects</li>
                <li><strong>Creator Collectives</strong>: Partnerships with influential content creator groups</li>
                <li><strong>Web3 Infrastructure Providers</strong>: Integration with key infrastructure services</li>
                <li><strong>NFT Communities</strong>: Collaborative initiatives with established NFT communities</li>
              </ul>
          </section>

          {/* Roadmap */}
          <section id="roadmap" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">10. ROADMAP</h2>
            
            <h3 className="text-xl font-semibold mt-6 mb-3">10.1 Phase 1: Foundation (Completed)</h3>
            <ul className="ml-6 mb-4 space-y-1">
              <li>✅ Development of the basic MySphere platform</li>
              <li>✅ Implementation of posts and comments system (BaseBook)</li>
              <li>✅ Web3 wallet integration (Coinbase Smart Wallet, WalletConnect)</li>
              <li>✅ User profile system with Builders panel</li>
              <li>✅ Basic NFT functionalities (My NFT's, Quotes on Base Creator)</li>
              <li>✅ Implementation of reputation system and builder rankings</li>
              <li>✅ IPFS integration for data storage</li>
              <li>✅ Basic AI functionality implementation</li>
              <li>✅ Responsive user interface</li>
                <li>✅ Firebase, Google Cloud, Vercel, ReCaptcha integration for data storage, authentication, and security</li>
              <li>✅ Launch of SPHERE NFT collection (Pioneer, Guardian, Master)</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">10.2 Phase 2: Expansion (Q2-Q3 2024)</h3>
            <ul className="ml-6 mb-4 space-y-1">
              <li>🔄 Full implementation of gamification and reward mechanisms</li>
              <li>🔄 Advanced AI Agent - platform assistant</li>
              <li>🔄 Extended NFT marketplace functionality</li>
              <li>🔄 Enhanced content discovery and recommendation system</li>
              <li>🔄 Expansion of social features (groups, events)</li>
              <li>🔄 Security audits and performance optimizations</li>
              <li>🔄 Development of tools for content creators</li>
              <li>🔄 New user acquisition campaigns</li>
              <li>🔄 Deployment of application from beta to live version</li>
              <li>🔄 First strategic partnerships with projects in the Base ecosystem</li>
              <li>🔄 Implementation of DAO governance structure</li>
            </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">10.3 Phase 3: Tokenization (Q4 2024 - Q1 2025)</h3>
              <ul className="ml-6 mb-4 space-y-1">
                <li>📋 Token Launcher with management interface for community projects</li>
                <li>📋 Expansion of marketplace features with advanced trading options</li>
                <li>📋 DeFi implementation - staking, yield farming, and rewards</li>
                <li>📋 Integration with Base Ecosystem layer protocols</li>
                <li>📋 Enhancement of reputation system with on-chain signals</li>
                <li>📋 API for external developers</li>
                <li>📋 Multilingual support and international expansion</li>
                <li>📋 Increased decentralization of data storage</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">10.4 Phase 4: Ecosystem (Q2-Q3 2025)</h3>
              <ul className="ml-6 mb-4 space-y-1">
                <li>📋 Introduction of platform utility token</li>
                <li>📋 Advanced analytics tools for creators</li>
                <li>📋 Cross-chain integration with other networks</li>
                <li>📋 Expansion of social-fi system with new financial instruments</li>
                <li>📋 Launch of grant program for developers</li>
                <li>📋 Implementation of identity verification mechanisms</li>
                <li>📋 Extended earning options for content creators</li>
                <li>📋 Optimization of user experience based on data</li>
                <li>📋 Dedicated solutions for brands and enterprises</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">10.5 Phase 5: Decentralization (Q4 2025 - 2026)</h3>
              <ul className="ml-6 mb-4 space-y-1">
                <li>📋 Decentralization of key platform functions</li>
                <li>📋 On-chain voting system for development proposals</li>
                <li>📋 Community-managed innovation fund</li>
                <li>📋 Cross-platform reputation protocol</li>
                <li>📋 Advanced data privacy mechanisms</li>
                <li>📋 Scalability for supporting millions of users</li>
                <li>📋 Comprehensive interoperability with Web3 ecosystem</li>
                <li>📋 Development of blockchain ecological initiatives</li>
              </ul>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">10.6 Success Metrics</h3>
              <ul className="list-disc ml-6 mb-4 space-y-1">
                <li>Growth in monthly active users</li>
                <li>Number and value of NFTs in the ecosystem</li>
                <li>User retention and engagement metrics</li>
                <li>Brand recognition in the Web3 space</li>
                <li>Platform token adoption</li>
                <li>DAO activity and growth</li>
                <li>Quality and diversity of published content</li>
              </ul>
              
              <div className="mt-4 text-sm text-gray-400">
                <p><strong>Legend:</strong></p>
                <p>✅ Completed</p>
                <p>🔄 In progress</p>
                <p>📋 Planned</p>
              </div>
          </section>

            {/* Conclusion */}
          <section id="conclusion" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#0052FF]/30">11. CONCLUSION</h2>
              
              <p className="mb-4">
                MySphere AI represents a forward-thinking approach to social media that addresses the limitations of traditional platforms while leveraging the unique capabilities of blockchain technology. By combining intuitive user experience with powerful Web3 functionality and advanced artificial intelligence capabilities, we aim to create a platform that provides real value to content creators, collectors, and community participants.
              </p>
              
              <p className="mb-4">
                Our vision extends beyond building another social application – we strive to pioneer a model of content ownership, creator monetization, and reputation building that can influence the broader digital landscape. Integration with Base provides a solid foundation for achieving these goals, offering the scalability, efficiency, and ecosystem support necessary for mainstream adoption.
              </p>
              
              <p className="mb-4">
                Artificial intelligence forms a central element of our strategy, going beyond typical applications in social media. Our AI solutions not only help personalize experiences and moderate content but also enable creators to generate unique digital assets, provide intelligent curation and content discovery tools, and support interactions between ecosystem participants. We believe that combining AI with blockchain technology creates a synergy that fundamentally changes how digital content is created and consumed.
              </p>
              
              <p className="mb-4">
                As we progress through our development roadmap, we remain committed to our core principles of user ownership, fair value distribution, and community empowerment. We invite creators, collectors, developers, and Web3 enthusiasts to join us in building the future of social content – a future where creativity is properly valued, contribution is fairly rewarded, and communities thrive through aligned incentives and shared ownership.
              </p>
              
              <p className="mb-4">
                Together, we can transform how the world creates, shares, and values digital content - supported by state-of-the-art AI algorithms that enhance human creativity rather than replace it.
              </p>
              
              <p className="mb-4">
                This document outlines our current vision and plans for mySphere.fun. As with any innovative technology project, specific details may evolve as we develop and respond to market conditions, technological advances, and community feedback.
              </p>
              
              <p className="mb-8">
                For the latest information, please visit mysphere.fun or join our community channels.
              </p>

              <div className="p-4 border border-[#0052FF]/30 rounded-lg bg-[#0052FF]/10 mb-8">
                <h4 className="text-lg font-semibold mb-2">Disclaimer</h4>
                <p className="text-sm">
                  This document represents the first version of the MySphere whitepaper. Future versions may be published as expanded iterations of this initial document, incorporating new developments, technological advancements, and community feedback while maintaining consistency with the core vision presented here. All updates will be clearly versioned and dated to ensure transparency in the project's evolution.
                </p>
              </div>
          </section>

          <footer className="mt-12 pt-6 pb-10 mb-12 border-t border-[#0052FF]/30 text-center text-sm text-gray-400">
            © 2025 mySphere.fun | All Rights Reserved
          </footer>
        </div>
      </div>
    </div>
    </>
  );
} 