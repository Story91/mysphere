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
    'Base': 'bg-soft-sunken text-soft-primary-deep border-soft-line',
    'Camp Network': 'bg-soft-accent-soft text-soft-accent-deep border-soft-accent/30',
  };

  return (
    <div className="bg-soft-surface rounded-card shadow-card p-4 w-full text-soft-ink">
      <div className="flex items-start space-x-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-soft-sunken flex-shrink-0">
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
                'text-soft-ink'
              }`}>
                {userName}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${networkStyles[network]}`}>
                {network}
              </span>
            </div>
            <span className="text-xs text-soft-ink-soft">{timestamp}</span>
          </div>

          {/* Post Content */}
          <p className="text-soft-ink-muted text-sm leading-relaxed">
            {content}
          </p>

          {/* Actions */}
          <div className="flex items-center space-x-4 mt-3 text-soft-ink-soft text-xs">
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