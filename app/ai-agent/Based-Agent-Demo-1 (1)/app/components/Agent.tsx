import { useState } from 'react';
import type { Address } from 'viem';
import useGetNFTs from '../hooks/useGetNFTs';
import useGetTokens from '../hooks/useGetTokens';
import AgentAssets from './AgentAssets';
import AgentProfile from './AgentProfile';
import Chat from './Chat';
import Navbar from './Navbar';
import Stream from './Stream';

export default function Agent() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  const [nfts, setNFTs] = useState<Address[]>([]);
  const [tokens, setTokens] = useState<Address[]>([]);

  const { getTokens } = useGetTokens({ onSuccess: setTokens });
  const { getNFTs } = useGetNFTs({ onSuccess: setNFTs });

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-black font-mono text-[#5788FA]">
      <Navbar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        isMobileChatOpen={isMobileChatOpen}
        setIsMobileChatOpen={setIsMobileChatOpen}
      />

      <div className="relative flex flex-grow overflow-hidden">
        <div
          className={`
          ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed z-20 flex h-full w-full flex-col overflow-y-auto bg-black transition-transform duration-300 lg:relative lg:z-0 lg:w-1/3 lg:translate-x-0 lg:border-[#5788FA]/50 lg:border-r `}
        >
          <AgentProfile />
          <AgentAssets
            getTokens={getTokens}
            getNFTs={getNFTs}
            tokens={tokens}
            nfts={nfts}
          />
        </div>

        <div className="flex w-full lg:w-2/3">
          <Chat getTokens={getTokens} getNFTs={getNFTs} />
          <Stream className="hidden" />
        </div>

        <div
          className={`
          ${
            isMobileChatOpen ? 'translate-y-0' : 'translate-x-full'
          } fixed top-0 z-8 flex h-full w-full flex-col overflow-y-auto bg-black pt-[100px] transition-transform duration-300 md:hidden`}
        >
          <Stream className="flex w-full flex-col" />
        </div>
      </div>
    </div>
  );
}
