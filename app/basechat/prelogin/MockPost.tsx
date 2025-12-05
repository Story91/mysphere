'use client';

import React from 'react';

type MockPostProps = {
  userName: string;
  userHandle: string;
  network: 'Base' | 'Camp Network';
  content: string;
  avatar: string;
  timestamp: string;
  likes: number;
  comments: number;
  tips: number;
};

const MockPost: React.FC<MockPostProps> = ({ userName, userHandle, network, content, avatar, timestamp, likes, comments, tips }) => {
  const isBaseName = userName.endsWith('.base.eth');
  const isSphereName = userName.endsWith('.sphere');
  const isCamperName = userName.endsWith('.camper');
  const isCeloName = userName.endsWith('.celo');
  const isWorldName = userName.endsWith('.world');

  const networkStyles = {
    'Base': 'bg-blue-100 text-blue-800 border-blue-200',
    'Camp Network': 'bg-orange-100 text-orange-800 border-orange-200',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 w-full text-black">
      <div className="flex items-start space-x-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0">
          <img src={avatar} alt="avatar" className="w-full h-full rounded-full object-cover" />
        </div>

        <div className="flex-1">
          {/* User Info and Timestamp */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${
                isBaseName ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600' : 
                isSphereName ? 'text-blue-600' :
                isCamperName ? 'text-orange-600' :
                isCeloName ? 'text-yellow-600' :
                isWorldName ? 'text-green-600' :
                'text-gray-800'
              }`}>
                {userName}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${networkStyles[network]}`}>
                {network}
              </span>
            </div>
            <span className="text-xs text-gray-500">{timestamp}</span>
          </div>

          {/* Post Content */}
          <p className="text-gray-700 text-sm leading-relaxed">
            {content}
          </p>

          {/* Actions */}
          <div className="flex items-center space-x-4 mt-3 text-gray-500 text-xs">
            <span>🤍 {likes}</span>
            <span>💬 {comments}</span>
            <span>💰 Tip ({tips})</span>
            <span>⚡ Transaction</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockPost; 