'use client';

/**
 * Formularz "napisz post" dla Solany.
 *
 * Odpowiednik CreatePostArc / CreatePostCelo i reszty, z jedna roznica: obok
 * configu podaje tez wlasny przycisk transakcji, bo sciezka Solany nie idzie
 * przez wagmi. Cala reszta - media, Spotify, zapis do Firestore, zdarzenie
 * `newPost` - to ten sam `ChainCreatePost`, ktorego uzywa szesc sieci EVM.
 *
 * `dynamic(..., { ssr: false })` na obu importach Solany jest tu rdzeniem, a
 * nie ozdoba:
 *  - bez `ssr: false` wallet-adapter probuje siegnac po `window` podczas
 *    renderu serwerowego i wywala build,
 *  - dzieki dynamicznemu importowi ~200 pakietow stacku Solany laduje sie
 *    dopiero po wejsciu na te zakladke. Kto zostaje na Base, nie pobiera ich
 *    wcale.
 */

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { useIsFarcasterMiniApp } from '../../../hooks/useIsFarcasterMiniApp';
import { SOLANA_POSTING } from '../config/SolanaPostingConfig';

const SolanaWalletProvider = dynamic(() => import('./SolanaWalletProvider'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-soft-line bg-soft-surface p-4 text-sm text-soft-ink-muted">
      Loading Solana wallet...
    </div>
  ),
});

const SolanaPostButton = dynamic(() => import('./SolanaPostButton'), {
  ssr: false,
}) as ComponentType<ChainPostButtonProps>;

type Props = Omit<ChainCreatePostProps, 'config' | 'PostButton'>;

export default function CreatePostSolana(props: Props) {
  const isFarcasterMiniApp = useIsFarcasterMiniApp();

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

  return (
    <SolanaWalletProvider>
      <ChainCreatePost {...props} config={SOLANA_POSTING} PostButton={SolanaPostButton} />
    </SolanaWalletProvider>
  );
}
