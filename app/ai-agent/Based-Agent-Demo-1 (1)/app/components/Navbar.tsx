import { useCallback, useEffect, useState } from 'react';
import { AGENT_NAME } from '../constants';
import StreamSvg from '../svg/StreamSvg';
import WalletSvg from '../svg/WalletSvg';
import { formatDateToBangkokTime } from '../utils';

type NavbarProps = {
  setIsMobileMenuOpen: (isOpen: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileChatOpen: (isOpen: boolean) => void;
  isMobileChatOpen: boolean;
};

export default function Navbar({
  setIsMobileMenuOpen,
  isMobileMenuOpen,
  isMobileChatOpen,
  setIsMobileChatOpen,
}: NavbarProps) {
  const [isLiveDotVisible, setIsLiveDotVisible] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // enables glowing live on sepolia dot
  useEffect(() => {
    const dotInterval = setInterval(() => {
      setIsLiveDotVisible((prev) => !prev);
    }, 1000);

    return () => clearInterval(dotInterval);
  }, []);

  const handleMobileProfileClick = useCallback(() => {
    if (!isMobileMenuOpen && isMobileChatOpen) {
      setIsMobileChatOpen(false);
    }
    setIsMobileMenuOpen(!isMobileMenuOpen);
  }, [
    isMobileMenuOpen,
    isMobileChatOpen,
    setIsMobileChatOpen,
    setIsMobileMenuOpen,
  ]);

  const handleMobileChatClick = useCallback(() => {
    if (!isMobileChatOpen && isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
    setIsMobileChatOpen(!isMobileChatOpen);
  }, [
    isMobileMenuOpen,
    isMobileChatOpen,
    setIsMobileChatOpen,
    setIsMobileMenuOpen,
  ]);

  if (!isClient) {
    return null;
  }

  return (
    <div className="z-10 flex flex-col items-center justify-between border-[#5788FA]/50 border-b bg-black">
      <div className="flex w-full items-center justify-between border-[#5788FA]/50 border-b p-2 md:hidden">
        <button type="button" onClick={handleMobileProfileClick}>
          <WalletSvg />
        </button>
        <h2 className="font-bold text-[#5788FA] text-xl">{AGENT_NAME}</h2>
        <button type="button" onClick={handleMobileChatClick}>
          <StreamSvg />
        </button>
      </div>
      <div className="flex w-full justify-between p-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <button
              className="mr-2 hidden md:flex lg:hidden"
              onClick={handleMobileProfileClick}
              type="button"
            >
              ☰
            </button>
            <div
              className={`h-2 w-2 rounded-full transition-all duration-700 ease-in-out ${
                isLiveDotVisible
                  ? 'bg-green-500 opacity-100'
                  : 'bg-green-500 opacity-40'
              }
        `}
            />
            <span className="text-xs text-zinc-50 sm:text-sm">
              Live on Base Sepolia
            </span>
          </div>
          <div
            className="hidden text-xs text-zinc-400 sm:text-sm md:flex"
            aria-live="polite"
          >
            {formatDateToBangkokTime(new Date())} ICT
          </div>
        </div>
        <div className="flex bg-black text-sm text-xs text-zinc-400 sm:text-sm ">
          <div className="hidden sm:flex">
            <span className="pr-1">Powered by</span>
            <a
              href="https://onchainkit.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold transition-colors hover:text-zinc-300"
            >
              OnchainKit
            </a>
            <span className="mx-2">·</span>
          </div>
          <a
            href="https://github.com/coinbase/onchain-agent-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-zinc-300"
          >
            Fork this template
          </a>
        </div>
      </div>
    </div>
  );
}
