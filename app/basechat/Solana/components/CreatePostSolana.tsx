'use client';

/**
 * Formularz "napisz post" dla Solany.
 *
 * Odpowiednik CreatePostArc / CreatePostCelo i reszty, z jedna roznica: obok
 * configu podaje tez wlasny przycisk transakcji, bo sciezka Solany nie idzie
 * przez wagmi. Cala reszta - media, Spotify, zapis do Firestore, zdarzenie
 * `newPost` - to ten sam `ChainCreatePost`, ktorego uzywa szesc sieci EVM.
 *
 * `dynamic(..., { ssr: false })` na przycisku jest tu rdzeniem, a nie ozdoba:
 *  - bez `ssr: false` web3.js probuje siegnac po `window` podczas renderu
 *    serwerowego i wywala build,
 *  - dzieki dynamicznemu importowi stos Solany laduje sie dopiero po wejsciu
 *    na te zakladke. Kto zostaje na Base, nie pobiera go wcale.
 *
 * PORTFEL NIE JEST JUZ TUTAJ. Do 23.09.2026 ta zakladka owijala sie wlasnym
 * WalletProviderem, wiec portfel podlaczony w nawigacji i portfel composera
 * byly dwoma niezaleznymi stanami. Teraz przycisk czyta wspolny portfel
 * aplikacji (useSolanaWallet z SolanaWalletHost): podlaczenie Solany w
 * nawigacji od razu przygotowuje composer i odwrotnie.
 */

import dynamic from 'next/dynamic';
import { useEffect, type ComponentType } from 'react';
import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { useIsFarcasterMiniApp } from '../../../hooks/useIsFarcasterMiniApp';
import { useSolanaWallet } from '../../../components/solana/SolanaWalletHost';
import { SOLANA_POSTING } from '../config/SolanaPostingConfig';

const SolanaPostButton = dynamic(() => import('./SolanaPostButton'), {
  ssr: false,
}) as ComponentType<ChainPostButtonProps>;

type Props = Omit<ChainCreatePostProps, 'config' | 'PostButton'>;

export default function CreatePostSolana(props: Props) {
  const isFarcasterMiniApp = useIsFarcasterMiniApp();
  const { ensureLoaded } = useSolanaWallet();

  // Otwarta zakladka Solany to sygnal, ze stos portfela bedzie zaraz potrzebny:
  // ladujemy go juz teraz, zeby pierwsze klikniecie "polacz" nie czekalo na
  // pobranie kodu. Samo zaladowanie niczego nie podlacza i o nic nie pyta.
  useEffect(() => {
    if (isFarcasterMiniApp === false) ensureLoaded();
  }, [isFarcasterMiniApp, ensureLoaded]);

  /**
   * Zakladka Solany jest w miniappie ukryta, ale deep link /basechat?network=solana
   * potrafi ja otworzyc mimo to. Bez tej bramki uzytkownik miniappa dostalby
   * pelny formularz i przycisk, ktory otwiera wybor portfela bez ani jednego
   * portfela do wyboru.
   *
   * Mowimy wprost, co zrobic, zamiast zostawiac pusty ekran.
   */
  if (isFarcasterMiniApp) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-soft-line bg-soft-surface p-4 text-sm text-soft-ink-muted"
      >
        <span className="font-medium text-soft-ink">Solana needs a browser wallet.</span>{' '}
        Phantom and friends are browser extensions, and this mini app runs inside Farcaster,
        where they are not available. Open MySphere in your browser to post on Solana - or pick
        another network here.
      </div>
    );
  }

  // `null` (wykrywanie w toku) tez nie renderuje formularza: lepiej pokazac
  // pusto przez ulamek sekundy niz zaladowac caly stack Solany i schowac go.
  if (isFarcasterMiniApp === null) {
    return null;
  }

  return <ChainCreatePost {...props} config={SOLANA_POSTING} PostButton={SolanaPostButton} />;
}
