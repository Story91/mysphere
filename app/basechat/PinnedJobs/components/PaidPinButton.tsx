'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { Crown, DollarSign } from 'lucide-react';
import { PinDuration } from '../../../utils/firebase';
import PaidPinModal from './PaidPinModal';

interface PaidPinButtonProps {
  postId: string;
  postContent: string;
  authorAddress: string;
  isPinned?: boolean;
  isPaidPin?: boolean;
  className?: string;
  onPinSuccess?: (txHash: string, duration: PinDuration) => void;
}

export default function PaidPinButton({
  postId,
  postContent,
  authorAddress,
  isPinned = false,
  isPaidPin = false,
  className = '',
  onPinSuccess
}: PaidPinButtonProps) {
  const { address } = useAccount();
  const [showPaidPinModal, setShowPaidPinModal] = useState(false);

  // Pokazuj button tylko jeśli:
  // - Post NIE jest już przypięty (admin lub paid)
  // - Użytkownik jest zalogowany
  // - To jest WŁASNY post użytkownika
  const shouldShowButton = 
    !isPinned && 
    address && 
    address.toLowerCase() === authorAddress.toLowerCase();

  if (!shouldShowButton) {
    return null;
  }

  const handlePinClick = () => {
    setShowPaidPinModal(true);
  };

  const handlePinSuccess = (txHash: string, duration: PinDuration) => {
    setShowPaidPinModal(false);
    if (onPinSuccess) {
      onPinSuccess(txHash, duration);
    }
  };

  return (
    <>
      {/* ===== OBWODKA, NIE WYPELNIENIE =====
          Ten przycisk byl pelnym pomaranczowym prostokatem (bg-soft-accent)
          stojacym w rzedzie szarych ikon akcji - i wygladal jak reklama we
          wlasnym interfejsie: krzyczal glosniej niz tresc posta, pod ktorym stoi.

          Przypiecie JEST platne, wiec akcent ma tu prawo byc. Ale wypelnienie
          zostawiamy przyciskom, ktore pobieraja KONKRETNA kwote (patrz
          PremiumGate). Ten tylko otwiera modal z cennikiem - kwoty jeszcze nie
          zna i niczego jeszcze nie pobiera. Obwodka mowi "to kosztuje" bez
          przekrzykiwania calego paska, a rzadkosc wypelnienia zostaje
          nienaruszona: jesli wszystko jest pomaranczowe, pomaranczowy nie znaczy
          juz nic.

          KONTRAST: tekst #c2410c na bialej karcie posta = 5.2:1 (bylo 6.9:1 na
          wypelnieniu, wiec nic sie nie pogorszylo ponizej progu). Obwodka
          accent-deep/70 = 3.1:1, czyli powyzej 3:1 wymaganych dla granicy
          kontrolki. Hover NIE zmienia tla - kazde tlo tinted zbija #c2410c
          ponizej 4.5:1, wiec ruch bierze na siebie obwodka i cien. */}
      <button
        onClick={handlePinClick}
        className={`flex items-center space-x-1 px-3 py-1.5 font-soft text-xs font-semibold rounded-pill border border-soft-accent-deep/70 bg-transparent text-soft-accent-deep transition-[border-color,box-shadow,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:border-soft-accent-deep hover:shadow-chip active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${className}`}
        title="Pin this post to the top"
      >
        <Crown className="w-3 h-3" />
        <span>Pin Post</span>
        <DollarSign className="w-3 h-3" />
      </button>

      {/* Modal */}
      <PaidPinModal
        isOpen={showPaidPinModal}
        onClose={() => setShowPaidPinModal(false)}
        postId={postId}
        postContent={postContent}
        authorAddress={authorAddress}
        onPinSuccess={handlePinSuccess}
      />
    </>
  );
} 