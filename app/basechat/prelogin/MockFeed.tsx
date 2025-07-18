'use client';

import React from 'react';
import MockPost from './MockPost';
import AdSenseFeedUnit from './AdSenseFeedUnit';

const mockPostsData = [
  {
    userName: 'onchain-dev.base.eth',
    userHandle: '@onchaindev',
    network: 'Base' as const,
    content: 'Just deployed a new smart contract on Base. The developer experience is getting smoother every day! #L2 #ETH',
    avatar: 'https://i.pravatar.cc/40?u=onchaindev',
    timestamp: '5m ago',
  },
  {
    userName: 'BasedAndBuilt',
    userHandle: '@basedandbuilt',
    network: 'Base' as const,
    content: 'The Base ecosystem is growing exponentially. Incredible to see so many builders shipping cool projects.',
    avatar: 'https://i.pravatar.cc/40?u=basedandbuilt',
    timestamp: '16m ago',
  },
  {
    userName: 'WAGMI.camper',
    userHandle: '@wagmi',
    network: 'Camp Network' as const,
    content: 'Love the community focus on Camp Network. It really feels like we are all building this together. 🏕️ #WAGMI',
    avatar: 'https://i.pravatar.cc/40?u=wagmi',
    timestamp: '28m ago',
  },
  {
    userName: 'DefiDegen.sphere',
    userHandle: '@defidegen',
    network: 'Base' as const,
    content: 'Exploring some new DeFi protocols on Base. The low transaction fees make it so much easier to experiment.',
    avatar: 'https://i.pravatar.cc/40?u=defidegen',
    timestamp: '45m ago',
  },
  {
    userName: 'CreatorDAO',
    userHandle: '@creatordao',
    network: 'Camp Network' as const,
    content: 'The creator economy on Camp Network is about to take off. The tools and support for creators are top-notch.',
    avatar: 'https://i.pravatar.cc/40?u=creatordao',
    timestamp: '1h ago',
  },
];

const MockFeed = () => {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-black via-gray-900 to-blue-900 rounded-lg text-center text-white p-4">
        <div className="flex justify-center mb-2 overflow-hidden">
          <div className="relative w-[250px] h-[100px] overflow-hidden">
            <img 
              src="/frame-v2.png" 
              alt="MySphere Logo" 
              className="w-full h-full object-contain"
              style={{
                filter: 'brightness(1.1) contrast(1.1)',
                mixBlendMode: 'lighten'
              }}
            />
          </div>
        </div>
        <p className="text-sm text-gray-300">Connect your wallet to join the conversation and see the live feed.</p>
      </div>
      
      {mockPostsData.slice(0, 2).map((post, index) => (
        <MockPost key={index} {...post} />
      ))}

      <AdSenseFeedUnit />

      {mockPostsData.slice(2).map((post, index) => (
        <MockPost key={index + 2} {...post} />
      ))}
    </div>
  );
};

export default MockFeed; 