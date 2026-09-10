// @ts-nocheck
'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { Post, Comment } from '../../types';
import { doc, updateDoc, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { fetchPosts, db, toggleLike, deletePost, toggleCommentLike, editComment, deleteComment, addCommentReply, addComment, fetchCommentsForPost, ADMIN_ADDRESS, pinPost, unpinPost, isUserAdmin, PinDuration ,
  getBulkPostTipStats,
  PostTipStats} from '../../utils/firebase';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { notify } from '../../utils/notify';
// Warstwa tozsamosci na wagmi/viem - zamiennik @coinbase/onchainkit/identity
import { Avatar as CoinbaseAvatar } from '../../components/identity';
import LinkPreview from './LinkPreview';
import B20PostCard, { findB20Address } from './B20PostCard';
import CommentTransactionButton from '../../components/CommentTransactionButton';
import CommentTransactionButtonBaseCamp from './BaseCampPosts/CommentTransactionButtonBaseCamp';
import CommentTransactionButtonCelo from '../Celo/components/CommentTransactionButtonCelo';
import CommentTransactionButtonEthereum from '../ETH/components/CommentTransactionButtonEthereum';
import CommentTransactionButtonWorldChain from '../World/components/CommentTransactionButtonWorldChain';
import CommentTransactionButtonLinea from '../Linea/components/CommentTransactionButtonLinea';
import CommentTransactionButtonRobinhood from '../Robinhood/components/CommentTransactionButtonRobinhood';
import CommentTransactionButtonArc from '../Arc/components/CommentTransactionButtonArc';
import { BASECAMP_CHAIN_ID } from '../../contracts/BaseCampPostContract';
import { CELO_CHAIN_ID } from '../Celo/config/CeloNetworkConfig';
import { ETHEREUM_CHAIN_ID } from '../ETH/config/EthereumNetworkConfig';
import { WORLD_CHAIN_ID } from '../World/config/WorldChainNetworkConfig';
import { ROBINHOOD_CHAIN_ID } from '../Robinhood/config/RobinhoodNetworkConfig';
import { ARC_CHAIN_ID } from '../Arc/contracts/ArcPostContract';
import { LINEA_CHAIN_ID } from '../Linea/config/LineaNetworkConfig';
import { base, baseSepolia } from 'wagmi/chains';
import TipButton from './TipButton';
import TipStats from './TipStats';
import PostAudioPlayer from './PostAudioPlayer';
import { stopAndReset as stopAudio } from './audioPlayerStore';
// Odznaka agent/czlowiek + trust score KYA (REDEFINICJA.md, pozycja 1.4)
import AgentBadge from '../../components/agents/AgentBadge';
import { useAgentLookup } from '../../components/agents/useAgentLookup';
// Monetyzacja (REDEFINICJA.md, faza 2): tip-to-unlock + wsparcie tworcy
import PremiumGate from '../../components/monetization/PremiumGate';
import SubscribeButton from '../../components/monetization/SubscribeButton';
import { useFeedUnlocks, useFeedSubscriptions } from '../../components/monetization/useFeedMonetization';
import { hasPremiumContent } from '../../utils/monetization/types';

// Import Zora SDK functions and types
import { getCachedCoin } from '../../utils/zoraSdk';
import { formatUnits } from 'viem';
import TradeCoinModal from './TradeCoinModal';
import { CreatorCoinData } from '../../utils/creatorCoin';

// ERC20 balanceOf ABI - standard for all ERC20 tokens
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Import social features
import { useSocialActions } from '../friendsystem/hooks';

// Import icons
import { ExternalLink } from 'lucide-react';

// Import shadcn components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SpotlightCard from '@/components/SpotlightCard';

// 🚀 Import PinnedJobs components
import PaidPinButton from '../PinnedJobs/components/PaidPinButton';
import PinTimer from '../PinnedJobs/components/PinTimer';
import PendingPinTimer from '../PinnedJobs/components/PendingPinTimer';
import ExtendPinModal from '../PinnedJobs/components/ExtendPinModal';

// Utility function for formatting large numbers with K, M, B suffixes
const formatNumberWithSuffix = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) return 'N/A';
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}K`;
  } else if (num < 0.01 && num > 0) {
    // Zamiast notacji naukowej, użyjmy bardziej przyjaznego formatu
    if (num < 0.000001) {
      return `${(num * 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}n`;
    } else if (num < 0.001) {
      return `${(num * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}μ`;
    } else {
      return `${(num * 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}m`;
    }
  }
  
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

/**
 * Komentarze dociagniete z kolekcji `comments`, per post - na poziomie MODULU.
 *
 * Nowe komentarze nie leza w tablicy dokumentu posta (dokument niesie sam
 * licznik), wiec sekcja komentarzy dociaga je przy pierwszym rozwinieciu.
 * Cache MUSI byc w module, nie w stanie komponentu: rodzic regularnie
 * NADPISUJE liste postow (zmiana zakladki, cieply cache, awaryjny refetch)
 * i kazdy taki reset przywraca tablice legacy. Efekt scalajacy w PostList
 * dociaga wtedy brakujace wpisy z tego cache'u bez ponownego odczytu
 * Firestore - a wpisy aktualizuja takze optymistyczne handlery, zeby
 * scalenie po resecie nie cofalo swiezych zmian.
 */
const collectionCommentsCache = new Map<string, Comment[]>();
const collectionCommentsInflight = new Map<string, Promise<void>>();

const rememberCollectionComment = (postId: string, comment: Comment) => {
  const list = collectionCommentsCache.get(postId);
  if (list && !list.some(c => c.id === comment.id)) list.push(comment);
};

/** Usuwa z cache'u komentarz i jego odpowiedzi - lustro deleteComment. */
const forgetCollectionComment = (postId: string, mainCommentId: string) => {
  const list = collectionCommentsCache.get(postId);
  if (list) {
    collectionCommentsCache.set(
      postId,
      list.filter(c => c.id !== mainCommentId && c.replyTo !== mainCommentId)
    );
  }
};

export interface ExtendedPost extends Post {
  pollId?: string;
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood' | 'arc';
  // 🚀 Paid Pin fields
  isPaidPin?: boolean;
  pinExpiresAt?: number;
  pinDuration?: string;
  pinOwner?: string;
  pinAmountPaid?: string;
  pinTxHash?: string;
  // ⏳ Pending Pin fields
  pendingPin?: boolean;
  pendingPinTx?: string;
  pendingPinExpectedAt?: number;
  pendingPinDuration?: string;
}

// Placeholder type for Zora Coin data
interface ZoraCoinData {
  totalSupply?: string;
  uniqueHolders?: number;
  symbol?: string;
  name?: string;
  marketCap?: string;
  volume24h?: string;
  createdAt?: string;
  priceUSD?: string;
  imageUrl?: string;
  priceChange24h?: number; // Add 24h price change percentage
  isFetched?: boolean;
}

// Interface for Zora API response
interface ZoraApiTokenInfo {
  id: string;
  name: string;
  description?: string;
  address: string;
  symbol: string;
  totalSupply: string;
  totalVolume?: string;
  volume24h?: string;
  createdAt?: string;
  creatorAddress?: string;
  marketCap?: string;
  priceUSD?: string;
  uniqueHolders?: number;
  priceChange24h?: number; // Add 24h price change percentage
  media?: {
    previewImage?: string;
    medium?: string;
    blurhash?: string;
  };
}

interface PostListProps {
  showOnlyUserPosts?: boolean;
  searchTerm?: string;
  sortOrder?: 'newest' | 'oldest';
  selectedTag?: string;
  selectedAuthor?: string;
  onRefreshPosts?: (newPosts?: ExtendedPost[]) => Promise<void>;
  onPostAdded?: () => Promise<void>;
  onCommentAdded?: () => Promise<void>;
  displayUserName: (userAddress: string, elementId: string, showAvatar?: boolean) => JSX.Element;
  userNames: {[key: string]: {name: string, avatar?: string}};
  posts: ExtendedPost[];
  isLoading?: boolean;
  disableInfiniteScroll?: boolean; // Nowy prop do wyłączenia infinite scroll
  showMyFeed?: boolean; // Nowy prop dla trybu My Feed
  getCachedPosts?: (cacheKey: string) => ExtendedPost[] | null; // Funkcje cache'owania
  setCachedPosts?: (cacheKey: string, posts: ExtendedPost[]) => void;
  clearPostsCache?: () => void;
  /**
   * Nanosi zmiane na jeden post w zapisanych listach - ZERO odczytow Firestore.
   * Bez tego polubienie znikaloby po przejsciu na inna zakladke i powrocie,
   * bo widok odtwarza sie z localStorage.
   */
  patchPostInCache?: (postId: string, patch: (post: ExtendedPost) => ExtendedPost) => void;
  // Pending pins props
  pendingPins?: {[postId: string]: {
    txHash: string;
    duration: string;
    expectedAt: number;
  }};
  onPinPending?: (postId: string, txHash: string, duration: string) => void;
}

// Utility function for extracting hashtags from text
const extractHashtags = (text: string): string[] => {
  const hashtags: string[] = [];
  text.split(/\s+/).forEach(word => {
    if (word.startsWith('#') && word.length > 1) {
      if (!hashtags.includes(word)) {
        hashtags.push(word);
      }
    }
  });
  return hashtags;
};

// ===== ODZNAKI SIECI =====
// Jedno zrodlo prawdy dla odznak sieci. Wczesniej kazda siec byla wypisana
// recznie w trzech miejscach (naglowek posta, komentarz, odpowiedz), wiec
// dodanie kolejnej sieci oznaczalo edycje w kilkudziesieciu miejscach.
// Teraz to jeden wpis w NETWORK_BADGES.
type NetworkBadgeSize = 'post' | 'comment' | 'reply';

interface NetworkBadgeDef {
  /** Tekst alternatywny ikony */
  alt: string;
  /** Tlo pigulki */
  chipClass: string;
  /** Ikona jako obrazek... */
  src?: string;
  /** ...albo jako wektor inline (Camp Network) */
  renderSvg?: (className: string) => JSX.Element;
  /** Rozmiar ikony osobno dla kazdego z trzech miejsc renderowania */
  iconClass: Record<NetworkBadgeSize, string>;
  /** Ikona na bialym kolku (World Chain - logo jest jednokolorowe) */
  onWhiteCircle?: boolean;
  /** Podpis - renderowany wylacznie w naglowku posta, tak jak dotychczas */
  label?: { text: string; className: string };
}

const renderCampIcon = (className: string) => (
  <svg
    className={className}
    viewBox="0 0 600 600"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Camp Network"
  >
    <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
    <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
    <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
    <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
  </svg>
);

const NETWORK_BADGES: Record<string, NetworkBadgeDef> = {
  basecamp: {
    alt: 'Camp Network',
    chipClass: 'bg-soft-sunken',
    renderSvg: renderCampIcon,
    iconClass: { post: 'w-4 h-4', comment: 'w-3 h-3', reply: 'w-2.5 h-2.5' },
    label: { text: 'Camp Network', className: 'text-soft-ink-muted' },
  },
  base: {
    alt: 'Base',
    chipClass: 'bg-soft-sunken',
    src: '/logotypy/Base_lockup_2color.png',
    iconClass: { post: 'h-3', comment: 'h-3', reply: 'h-2.5' },
  },
  linea: {
    alt: 'Linea',
    chipClass: 'bg-soft-sunken',
    src: '/Logomark Blue BG.svg',
    iconClass: { post: 'w-4 h-4', comment: 'w-3 h-3', reply: 'w-2.5 h-2.5' },
    label: { text: 'Linea', className: 'text-soft-ink-muted' },
  },
  celo: {
    alt: 'Celo',
    chipClass: 'bg-soft-sunken',
    src: '/logotypy/ENL3ZjX9OnprxVs5u8A81khADqA.webp',
    iconClass: { post: 'h-5', comment: 'h-4', reply: 'h-3' },
  },
  ethereum: {
    alt: 'Ethereum',
    chipClass: 'bg-soft-sunken',
    src: '/ethlogo.png',
    iconClass: { post: 'w-4 h-4', comment: 'w-3 h-3', reply: 'w-2.5 h-2.5' },
    label: { text: 'ETH', className: 'text-soft-ink-muted' },
  },
  worldchain: {
    alt: 'World Chain',
    chipClass: 'bg-soft-sunken',
    src: '/logotypy/world-symbol-dark.svg',
    // Znak jest teraz CIEMNY, wiec bialy krazek pod nim jest zbedny - byl tam
    // wylacznie po to, zeby bialy obrys mial sie na czym odcinac.
    // Wymiary kwadratowe zamiast samej wysokosci: to symbol 1:1, a `h-3` bez
    // szerokosci rozciagalo go wedlug proporcji poprzedniego pliku (lockup 4:1).
    iconClass: { post: 'w-4 h-4', comment: 'w-3 h-3', reply: 'w-2.5 h-2.5' },
  },
  robinhood: {
    alt: 'Robinhood Chain',
    chipClass: 'bg-soft-sunken',
    // Logo ma WLASNE, limonkowe tlo wypelniajace caly kwadrat - inaczej niz
    // pozostale ikony sieci, ktore sa przezroczyste. Bez zaokraglenia rysowaloby
    // sie jako ostry zielony kwadrat w owalnej pigulce. `rounded-[4px]` sprawia,
    // ze czyta sie jak ikona aplikacji, czyli tak, jak to logo jest uzywane
    // wszedzie indziej.
    src: '/robin.webp',
    iconClass: {
      post: 'w-4 h-4 rounded-[4px]',
      comment: 'w-3 h-3 rounded-[3px]',
      reply: 'w-2.5 h-2.5 rounded-[3px]',
    },
    label: { text: 'RH', className: 'text-soft-ink-muted' },
  },
  arc: {
    alt: 'Arc',
    chipClass: 'bg-soft-sunken',
    // Znak Arc, jak Robinhood, ma wlasne tlo - to samo zaokraglenie.
    src: '/arc.jpg',
    iconClass: {
      post: 'w-4 h-4 rounded-[4px]',
      comment: 'w-3 h-3 rounded-[3px]',
      reply: 'w-2.5 h-2.5 rounded-[3px]',
    },
    label: { text: 'Arc', className: 'text-soft-ink-muted' },
  },
};

const NetworkBadge = ({ network, size }: { network?: string | null; size: NetworkBadgeSize }) => {
  const def = network ? NETWORK_BADGES[network] : undefined;
  if (!def) return null;

  const iconClass = def.iconClass[size];
  const icon = def.renderSvg
    ? def.renderSvg(iconClass)
    : <img src={def.src} alt={def.alt} className={iconClass} />;

  // W naglowku posta odznaka stoi w linii metadanych, ktora ma wlasny `gap` -
  // wlasny `ml-2` dokladalby tam drugi odstep. Komentarz i odpowiedz zostaja
  // bez zmian, bo tam odznaka nadal dokleja sie do tekstu obok.
  return (
    <div className={`flex items-center py-0.5 rounded-pill ${size === 'reply' ? 'ml-1.5 px-1.5' : size === 'comment' ? 'ml-2 px-2' : 'px-1.5'} ${def.chipClass}`}>
      {def.onWhiteCircle
        ? <div className="bg-soft-surface rounded-full p-0.5 flex items-center justify-center">{icon}</div>
        : icon}
      {size === 'post' && def.label && (
        <span className={`ml-1 font-soft text-[11.5px] font-semibold ${def.label.className}`}>{def.label.text}</span>
      )}
    </div>
  );
};

// ===== PASEK AKCJI POD POSTEM =====
// Jedna definicja rozmiaru dla KAZDEJ pozycji paska. Wczesniej mieszaly sie tu
// trzy miary naraz i najlepiej bylo to widac na telefonie:
//   - Share niosl napis na kazdej szerokosci, wiec byl dwa razy szerszy od reszty,
//   - Tip i Support chowaly swoje napisy dopiero od `md`, czyli w innym miejscu,
//   - Support ponizej `md` pokazywal emoji (💜/🤝) zamiast ikony wektorowej,
//     a emoji ma inna wysokosc linii niz svg i podnosilo caly rzad.
//
// 16px na ikone to rozmiar, ktory kazdy wektor w tym pasku juz mial - zmienia sie
// nie ikona, tylko pole wokol niej.
const ACTION_ICON = 'w-4 h-4 flex-shrink-0';

// 40x40 to minimum pola dotykowego. Ikona ma 16px, wiec bez `min-h`/`min-w`
// przycisk mierzyl ~28px wysokosci - trafialo sie w niego kciukiem na wyczucie.
const ACTION_ITEM =
  'inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-2 rounded-pill font-soft text-[12.5px] font-semibold ' +
  'transition-[color,background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong ' +
  'hover:bg-soft-sunken hover:text-soft-primary-deep active:scale-[0.97] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-soft-primary';

// Ponizej `sm` zostaje sama ikona. Kazda pozycja ma `aria-label`, wiec czytnik
// ekranu nie traci na tym nic - traci tylko szerokosc, ktorej na 320px nie ma.
const ACTION_LABEL = 'hidden sm:inline';

// TipButton i SubscribeButton mieszkaja w osobnych plikach i same decyduja
// o swoim wnetrzu.
//
// Przez chwile dorownywalismy je STAD, selektorami potomnymi po ich strukturze
// (`[&>span:last-child]:hidden`, `[&>svg]:block`, `[&>*+*]:!ml-0`). Dzialalo,
// ale wiazalo wyglad calego paska z tym, ze pierwszym dzieckiem tamtych
// przyciskow jest akurat `span` - czyli dowolna zmiana w ICH srodku psulaby
// uklad TUTAJ, bez zadnego sygnalu.
//
// Prog zostal wiec ustawiony U ZRODLA: oba komponenty maja juz `hidden
// sm:inline` na swoich napisach, ten sam co ACTION_LABEL wyzej. Zostaje
// wylacznie wyrownanie pola dotykowego i rozmiaru ikony, ktore nie zaglada
// w cudza strukture.
const ACTION_ITEM_EXTERNAL =
  `${ACTION_ITEM} text-soft-ink-soft hover:!text-soft-primary-deep`;

// Support ma wlasny `space-x-1`; `gap` z ACTION_ITEM wystarcza, wiec zerujemy
// odstep miedzy dziecmi. To jedyne, co jeszcze siega do srodka - i jest
// niegrozne, bo dotyczy odstepu, nie widocznosci.
const ACTION_ITEM_SUPPORT = `${ACTION_ITEM_EXTERNAL} [&>*+*]:!ml-0`;

// Przypiecie za oplata zostaje pelnym, nazwanym przyciskiem - to jedyna pozycja
// paska, ktora kosztuje, pojawia sie wylacznie pod wlasnym postem i bez napisu
// bylaby zagadka (korona i dolar). Dorownujemy jej wysokosc i rozmiar ikon.
const ACTION_ITEM_PAID = 'min-h-[40px] [&_svg]:w-4 [&_svg]:h-4';

// ===== SIEC POSTA / KOMENTARZA =====
// Ten sam lancuch if-ow byl wczesniej przepisany osobno w handleAddComment
// i w handleAddReply - rozjechanie sie ich znaczylo cicho zla odznake.
type PostNetwork = 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood' | 'arc';

const resolvePostNetwork = (chainId: number): PostNetwork | undefined => {
  if (chainId === base.id || chainId === baseSepolia.id) return 'base';
  if (chainId === BASECAMP_CHAIN_ID) return 'basecamp';
  if (chainId === LINEA_CHAIN_ID) return 'linea';
  if (chainId === CELO_CHAIN_ID) return 'celo';
  if (chainId === ETHEREUM_CHAIN_ID) return 'ethereum';
  if (chainId === WORLD_CHAIN_ID) return 'worldchain';
  if (chainId === ROBINHOOD_CHAIN_ID) return 'robinhood';
  if (chainId === ARC_CHAIN_ID) return 'arc';
  return undefined;
};

// Przycisk komentarza zalezy od sieci, na ktorej stoi PORTFEL (nie od sieci posta).
// Base i sieci nieznane trafiaja na ten sam, domyslny przycisk.
const COMMENT_BUTTON_BY_CHAIN: Record<number, typeof CommentTransactionButton> = {
  [BASECAMP_CHAIN_ID]: CommentTransactionButtonBaseCamp,
  [CELO_CHAIN_ID]: CommentTransactionButtonCelo,
  [ETHEREUM_CHAIN_ID]: CommentTransactionButtonEthereum,
  [WORLD_CHAIN_ID]: CommentTransactionButtonWorldChain,
  [LINEA_CHAIN_ID]: CommentTransactionButtonLinea,
  [ROBINHOOD_CHAIN_ID]: CommentTransactionButtonRobinhood,
  [ARC_CHAIN_ID]: CommentTransactionButtonArc,
};

// ===== EKSPLORATORY =====
// Sieci bez `tokenUrl` nie maja wlasnej strony tokena - tak jak dotychczas
// laduja na Basescanie.
const BASESCAN = {
  name: 'Basescan',
  txUrl: 'https://basescan.org/tx/',
  tokenUrl: 'https://basescan.org/token/',
};

const EXPLORERS: Record<string, { name: string; txUrl: string; tokenUrl?: string }> = {
  basecamp: {
    name: 'Camp Network Explorer',
    txUrl: 'https://camp.cloud.blockscout.com/tx/',
    tokenUrl: 'https://camp.cloud.blockscout.com/token/',
  },
  celo: {
    name: 'Celo Explorer',
    txUrl: 'https://celo.blockscout.com/tx/',
    tokenUrl: 'https://celo.blockscout.com/token/',
  },
  ethereum: {
    name: 'Etherscan',
    txUrl: 'https://etherscan.io/tx/',
    tokenUrl: 'https://etherscan.io/token/',
  },
  worldchain: {
    name: 'Worldscan',
    txUrl: 'https://worldscan.org/tx/',
    tokenUrl: 'https://worldscan.org/token/',
  },
  linea: { name: 'Lineascan', txUrl: 'https://lineascan.build/tx/' },
  robinhood: { name: 'Robinhood Explorer', txUrl: 'https://robinhoodchain.blockscout.com/tx/' },
  arc: { name: 'Arcscan', txUrl: 'https://testnet.arcscan.app/tx/', tokenUrl: 'https://testnet.arcscan.app/token/' },
};

const getTxExplorer = (network?: string) => (network && EXPLORERS[network]) || BASESCAN;
const getTokenExplorer = (network?: string) => {
  const explorer = network ? EXPLORERS[network] : undefined;
  return explorer?.tokenUrl ? explorer : BASESCAN;
};

function PostList({
  showOnlyUserPosts = false,
  searchTerm = '',
  sortOrder = 'newest',
  selectedTag = '',
  selectedAuthor = '',
  onRefreshPosts,
  onPostAdded,
  onCommentAdded,
  displayUserName,
  userNames,
  posts,
  isLoading = false,
  disableInfiniteScroll = false,
  showMyFeed = false,
  getCachedPosts,
  setCachedPosts,
  clearPostsCache,
  patchPostInCache,
  pendingPins = {},
  onPinPending
}: PostListProps) {
  const [newComments, setNewComments] = useState<{[key: string]: string}>({});
  const [expandedPosts, setExpandedPosts] = useState<{[key: string]: boolean}>({});
  const [expandedComments, setExpandedComments] = useState<{[key: string]: boolean}>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [editingComment, setEditingComment] = useState<{postId: string, commentId: string} | null>(null);
  const [editedCommentContent, setEditedCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<{postId: string, commentId: string} | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [expandedTextPosts, setExpandedTextPosts] = useState<{[key: string]: boolean}>({});
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [postTokenData, setPostTokenData] = useState<{[postId: string]: ZoraCoinData}>({});
  const [isLoadingTokenData, setIsLoadingTokenData] = useState<{[postId: string]: boolean}>({});
  const [userTokenBalances, setUserTokenBalances] = useState<{[tokenAddress: string]: string}>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  
  // ✅ LAZY LOADING KOMENTARZY: Stan do śledzenia ile komentarzy pokazywać
  const [visibleComments, setVisibleComments] = useState<{[key: string]: number}>({});
  const INITIAL_COMMENTS_COUNT = 5;
  const LOAD_MORE_COMMENTS_COUNT = 3;
  
  // Handel odbywa sie w TradeCoinModal - stan starego, wlasnego modalu
  // transakcji zostal usuniety razem z nim.
  const [internalPosts, setInternalPosts] = useState<ExtendedPost[]>(posts);
  
  // States for TradeCoinModal
  const [showTradeCoinModal, setShowTradeCoinModal] = useState(false);
  const [tradeCoinData, setTradeCoinData] = useState<CreatorCoinData | null>(null);
  const [tradeCoinBalance, setTradeCoinBalance] = useState<string>('0');
  const [tradeCoinMode, setTradeCoinMode] = useState<'buy' | 'sell'>('buy');
  
  useEffect(() => {
    setInternalPosts(posts);
  }, [posts]);
  
  // Extend Pin Modal state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendingPostId, setExtendingPostId] = useState<string | null>(null);
  const [extendingExpiresAt, setExtendingExpiresAt] = useState<number>(0);
  
  // Pending Pin state is now managed by parent component via props
  
  // ❌ Usunięto loadMoreTriggerRef - nie potrzebny bez infinite scroll
  const { address, isConnected } = useAccount();

  // 🚀 SOCIAL FEATURES: Hook i stany (MOVED AFTER useAccount)
  // Lekki hook - feed nie potrzebuje pelnego loadAllData z useSocial (patrz hooks.ts).
  const { followUser, unfollowUser, getFollowStatuses } = useSocialActions(address || null);
  const [followingStatus, setFollowingStatus] = useState<{[address: string]: boolean}>({});
  const [followLoading, setFollowLoading] = useState<{[address: string]: boolean}>({});

  // Statystyki tipow dla calego feedu jednym zapytaniem na 30 postow.
  // Wczesniej kazdy <TipStats> robil wlasne getDocs - przy 25 postach 25 zapytan.
  const [postTipStats, setPostTipStats] = useState<{ [postId: string]: PostTipStats }>({});
  const [tipStatsLoading, setTipStatsLoading] = useState(true);
  /**
   * Zbiorcze zapytanie o tipy PADLO.
   *
   * Bez tej flagi pusta mapa `postTipStats` znaczyla to samo, co "zaden post
   * nie dostal ani zlotowki" - i tak wlasnie renderowal sie caly feed po
   * jednym nieudanym zapytaniu.
   */
  const [tipStatsFailed, setTipStatsFailed] = useState(false);

  /**
   * SAM SKLAD feedu, nie jego zawartosc.
   *
   * Efekty ponizej wisialy na `internalPosts`, czyli na TOZSAMOSCI tablicy.
   * Kazda optymistyczna zmiana (polubienie posta, polubienie komentarza) tworzy
   * nowa tablice, wiec jedno klikniecie serduszka kasowalo `postTipStats`,
   * podnosilo `tipStatsLoading` i przelaczalo pasek napiwkow POD KAZDYM postem
   * w stan "Loading...", a do tego wysylalo zbiorcze zapytanie o napiwki dla
   * calego feedu od nowa. To samo dotyczylo odznak agentow i tresci premium.
   *
   * Klucz z identyfikatorow zmienia sie dopiero wtedy, gdy postow faktycznie
   * przybywa albo ubywa - a tylko wtedy te dane trzeba pobrac ponownie.
   */
  const postIdsKey = React.useMemo(
    () => (internalPosts || []).map(p => p.id).filter(Boolean).join(','),
    [internalPosts]
  );
  const authorsKey = React.useMemo(
    () => Array.from(new Set((internalPosts || []).map(p => p.author).filter(Boolean))).join(','),
    [internalPosts]
  );
  const premiumPostIdsKey = React.useMemo(
    () => (internalPosts || []).filter(p => hasPremiumContent(p)).map(p => p.id).filter(Boolean).join(','),
    [internalPosts]
  );

  useEffect(() => {
    // Zrodlem jest internalPosts, nie prop `posts` - to z internalPosts renderuje
    // sie lista i to tam trafiaja posty dodane optymistycznie (event 'post-created').
    const ids = postIdsKey ? postIdsKey.split(',') : [];

    if (ids.length === 0) {
      // Bez tego flaga zostawala na `true` i TipStats krecil spinner w nieskonczonosc.
      setTipStatsLoading(false);
      setTipStatsFailed(false);
      setPostTipStats({});
      return;
    }

    let cancelled = false;
    setTipStatsLoading(true);
    setTipStatsFailed(false);
    getBulkPostTipStats(ids)
      .then(stats => {
        if (cancelled) return;
        // `null` = odczyt padl. Pusta mapa pod postami znaczylaby "zero tipow".
        setTipStatsFailed(stats === null);
        setPostTipStats(stats ?? {});
      })
      .catch(err => {
        console.error('Error fetching bulk tip stats:', err);
        if (!cancelled) setTipStatsFailed(true);
      })
      .finally(() => { if (!cancelled) setTipStatsLoading(false); });

    return () => { cancelled = true; };
  }, [postIdsKey]);

  // Odznaka agenta - ten sam wzorzec, co statystyki tipow wyzej: unikalne
  // adresy autorow zbierane RAZ dla calego feedu i jedno zapytanie zbiorcze,
  // zamiast odpytywania KYA przy kazdym poscie. Szczegoly w useAgentLookup.ts.
  const authorAddressesForAgents = React.useMemo(
    () => (authorsKey ? authorsKey.split(',') : []),
    [authorsKey]
  );
  const { getAgent: getAgentInfo, loading: agentLookupLoading } = useAgentLookup(authorAddressesForAgents);

  // Monetyzacja - ten sam wzorzec zbiorczy, co statystyki tipow wyzej.
  // Odblokowania pytamy TYLKO o posty, ktore w ogole maja tresc premium, wiec
  // feed bez takich postow (czyli caly dzisiejszy stan bazy) nie robi zadnego
  // dodatkowego zapytania. Wsparcia - jedno zapytanie na 30 unikalnych autorow.
  const premiumPostIds = React.useMemo(
    () => (premiumPostIdsKey ? premiumPostIdsKey.split(',') : []),
    [premiumPostIdsKey]
  );
  const { unlockedPostIds, markUnlocked } = useFeedUnlocks(address, premiumPostIds);
  const { subscribedCreators, markSubscribed } = useFeedSubscriptions(address, authorAddressesForAgents);

  // 🎵 Stan odtwarzacza mieszka w audioPlayerStore (poza Reactem) - patrz PostAudioPlayer.
  useEffect(() => stopAudio, []);

  // Powiekszony obraz zamykal sie tylko klinieciem w tlo - z klawiatury nie
  // bylo jak z niego wyjsc.
  useEffect(() => {
    if (!enlargedImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlargedImage(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enlargedImage]);
  /**
   * Klient PRZYPIETY DO BASE, nie do aktualnie podlaczonej sieci.
   *
   * Jedyne, co przez niego czytamy, to salda monet Zora (`zoraCoinAddress`),
   * a te kontrakty istnieja WYLACZNIE na Base. Wczesniej stalo tu
   * `usePublicClient()` bez argumentu, czyli klient sieci, na ktorej akurat
   * siedzi portfel - wiec gdy uzytkownik byl na Ethereum, `balanceOf` szlo pod
   * adres, pod ktorym na mainnecie nic nie ma, i wracalo puste `0x`. W konsoli
   * dawalo to serie ContractFunctionZeroDataError ("returned no data"), a w UI
   * ciche zero zamiast salda.
   */
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const networkChainId = useChainId();
  // Jeden wybor przycisku komentarza dla calego feedu - wczesniej ta sama
  // siedmiostopniowa drabinka ternarna byla przepisana dwa razy.
  const ChainCommentButton = COMMENT_BUTTON_BY_CHAIN[networkChainId] || CommentTransactionButton;

  useEffect(() => {
    const handleNewPost = (event: Event) => {
      const newPost = (event as CustomEvent).detail as ExtendedPost;
      // Add the new post to the beginning of the list
      setInternalPosts(prevPosts => [newPost, ...prevPosts]);
    };

    document.addEventListener('post-created', handleNewPost);

    return () => {
      document.removeEventListener('post-created', handleNewPost);
    };
  }, []);

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'recently';
    }
  };

  // Pending Pin management is now handled by parent component

  const refreshPosts = async () => {
    if (onRefreshPosts) {
      await onRefreshPosts();
    }
  };
  
  // ✅ LAZY LOADING KOMENTARZY: Funkcja do ładowania więcej komentarzy
  const loadMoreComments = (postId: string) => {
    const currentVisible = visibleComments[postId] || INITIAL_COMMENTS_COUNT;
    setVisibleComments(prev => ({
      ...prev,
      [postId]: currentVisible + LOAD_MORE_COMMENTS_COUNT
    }));
  };

  const handleDeletePost = async (postId: string) => {
    if (!address) return;
    
    try {
      if (confirm('Are you sure you want to delete this post?')) {
        await deletePost(postId, address);
        toast.success('Post deleted');
        
        await refreshPosts();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
      await refreshPosts();
    }
  };

  const handlePinPost = async (postId: string) => {
    if (!address || !isUserAdmin(address)) {
      toast.error('Only admins can pin posts');
      return;
    }
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            isPinned: true,
            pinnedAt: Date.now(),
            pinnedBy: address
          };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast z optimistic update
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      // Wykonaj rzeczywistą operację w tle
      const success = await pinPost(postId, address);
      
      if (success) {
        toast.success('Post pinned');
        // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował UI
        // Oszczędność: 50 Firebase reads po każdym pin
      } else {
        toast.error('Failed to pin post');
        // W przypadku błędu, przywróć poprzedni stan
        if (onRefreshPosts) {
          await onRefreshPosts();
        }
      }
    } catch (error) {
      console.error('Error pinning post:', error);
      toast.error('Failed to pin post');
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleUnpinPost = async (postId: string) => {
    if (!address || !isUserAdmin(address)) {
      toast.error('Only admins can unpin posts');
      return;
    }
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            isPinned: false,
            pinnedAt: undefined,
            pinnedBy: undefined
          };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast z optimistic update
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      // Wykonaj rzeczywistą operację w tle
      const success = await unpinPost(postId, address);
      
      if (success) {
        toast.success('Post unpinned');
        // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował UI
        // Oszczędność: 50 Firebase reads po każdym unpin
      } else {
        toast.error('Failed to unpin post');
        // W przypadku błędu, przywróć poprzedni stan
        if (onRefreshPosts) {
          await onRefreshPosts();
        }
      }
    } catch (error) {
      console.error('Error unpinning post:', error);
      toast.error('Failed to unpin post');
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleEditPost = async (postId: string, newContent: string) => {
    if (!address) return;
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
        content: newContent,
            lastEdited: Date.now()
          };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      setEditingPost(null);
      setEditedContent('');
      
      // Wykonaj rzeczywistą operację w tle
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        content: newContent,
        lastEdited: serverTimestamp()
      });
      
      toast.success('Post updated');
      
      // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował post
      // Oszczędność: 50 Firebase reads po każdej edycji posta
      
    } catch (error) {
      console.error('Error editing post:', error);
      toast.error('Failed to edit post');
      
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleAddComment = async (postId: string, txHash: string) => {
    if (!address) return;
    
    try {
      const network = resolvePostNetwork(networkChainId);

      const draft = {
        postId: postId,
        author: address,
        content: newComments[postId],
        timestamp: Date.now(),
        txHash: txHash,
        likes: 0,
        likedBy: [] as string[],
        mentions: [] as string[],
        network: network // Dodajemy network komentarza
      };

      // Prawdziwe ID z Firestore, nie `temp-...`. Bez tego swiezo dodanego
      // komentarza nie dalo sie polubic ani usunac az do odswiezenia feedu -
      // obie operacje szly pod dokument, ktory nie istnieje, i konczyly sie
      // komunikatem o awarii, mimo ze zapis sie powiodl.
      const commentId = await addComment(postId, draft);

      const newComment: Comment = { ...draft, id: commentId };
      // Do cache'u modulu od razu: scalenie po resecie stanu z rodzica nie
      // moze cofnac komentarza, ktory juz jest w bazie.
      rememberCollectionComment(postId, newComment);

      setNewComments(prev => ({
        ...prev,
        [postId]: ''
      }));
      
      toast.success('Comment added');
      
      // Optymistyczna aktualizacja UI - dodajemy komentarz lokalnie
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            comments: [...(post.comments || []), newComment],
            commentsCount: (post.commentsCount ?? post.comments?.length ?? 0) + 1
          };
        }
        return post;
      });

      // Aktualizujemy posty lokalnie, zachowując stan scrollowania
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      // W przypadku błędu, odświeżamy posty
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  /**
   * Polubienie postu.
   *
   * === CO TU BYLO ZLE (zgloszone: "nie da sie lajkowac") ===
   *
   * 1. Optymistyczna zmiana szla przez `onRefreshPosts(updatedPosts)`, a ta
   *    funkcja w page.tsx podnosi `isLoadingPosts` na czas swojego dzialania.
   *    Klikniecie serduszka przelaczalo wiec CALY feed w stan ladowania -
   *    lista mrugala szkieletami przy kazdym lajku.
   *
   * 2. `catch` obejmowal oba wywolania naraz, wiec blad odswiezania listy
   *    wygladal identycznie jak odrzucony lajk: komunikat "Failed to like post"
   *    plus cofniecie stanu, nawet gdy zapis sie powiodl.
   *
   * 3. NAJWAZNIEJSZE i moje wlasne przewinienie: `prependPostToCache` zapisuje
   *    do localStorage post optymistyczny z identyfikatorem `temp-...`.
   *    Jesli sesja skonczyla sie przed odpowiedzia Firestore, taki wpis
   *    zostawal w cache na stale i wygladal jak zwykly post. Proba polubienia
   *    szla wtedy pod `posts/temp-123`, dokument nie istnial, transakcja
   *    rzucala - i uzytkownik dostawal komunikat o bledzie przy KAZDEJ probie.
   *
   * === JAK JEST TERAZ ===
   * Stan zmieniamy lokalnie (bez przelaczania feedu w ladowanie), a przy bledzie
   * cofamy WYLACZNIE ten jeden post. Post jeszcze niezapisany rozpoznajemy po
   * identyfikatorze i mowimy o tym wprost, zamiast udawac awarie.
   */
  const handleToggleLike = async (postId: string) => {
    if (!address) {
      notify.info('Connect your wallet to like posts');
      return;
    }

    const postIndex = internalPosts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;

    // Post czekajacy na zapis w Firestore nie ma jeszcze czego polubic.
    if (postId.startsWith('temp-')) {
      notify.info('This post is still being saved. Give it a second.');
      return;
    }

    const post = internalPosts[postIndex];
    const wasLiked = !!post.likedBy?.includes(address);

    const applyLike = (liked: boolean) =>
      setInternalPosts(current =>
        current.map(entry =>
          entry.id !== postId
            ? entry
            : {
                ...entry,
                likes: Math.max(0, (entry.likes || 0) + (liked ? 1 : -1)),
                likedBy: liked
                  ? [...(entry.likedBy || []), address]
                  : (entry.likedBy || []).filter(id => id !== address),
              }
        )
      );

    // 1. Natychmiastowa reakcja w UI.
    applyLike(!wasLiked);

    try {
      // 2. Zapis. Dopiero jego niepowodzenie jest bledem lajka.
      //
      //    Podajemy `wasLiked` i autora, bo OBA juz mamy - `wasLiked` liczymy
      //    kilka linii wyzej, zeby narysowac serduszko, a autor stoi na poscie.
      //    Dzieki temu lajk to jeden zapis i zero odczytow: firebase.ts nie
      //    musi otwierac posta tylko po to, zeby dowiedziec sie tego, co my juz
      //    wiemy. Szczegoly przy samej funkcji.
      await toggleLike(postId, address, { wasLiked, author: post.author });

      // 3. Ta sama zmiana na ZAPISANYCH listach. Bez tego serduszko wracaloby
      //    do poprzedniego stanu po przejsciu na inna zakladke i powrocie, bo
      //    widok odtwarza sie z localStorage. Kosztuje ZERO odczytow -
      //    alternatywa byloby skasowanie cache'u i pobranie calego feedu od
      //    nowa za jedno klikniecie.
      patchPostInCache?.(postId, (entry) => ({
        ...entry,
        likes: Math.max(0, (entry.likes || 0) + (wasLiked ? -1 : 1)),
        likedBy: wasLiked
          ? (entry.likedBy || []).filter((id) => id !== address)
          : [...(entry.likedBy || []), address],
      }));
    } catch (error) {
      console.error('Error toggling like:', error);
      // 3. Cofamy TYLKO ten post - reszta listy zostaje nietknieta.
      applyLike(wasLiked);
      notify.error(
        error instanceof Error && error.message.includes('nie istnieje')
          ? 'That post no longer exists'
          : 'Could not save your like'
      );
    }
  };

  const handleEditComment = async (postId: string, commentId: string, newContent: string) => {
    if (!address) return;
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj komentarz w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          const updatedComments = post.comments?.map(comment => {
            if (comment.id === commentId) {
              return {
                ...comment,
                content: newContent,
                lastEdited: Date.now()
              };
            }
            return comment;
          });
          return { ...post, comments: updatedComments };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      setEditingComment(null);
      setEditedCommentContent('');
      
      // Wykonaj rzeczywistą operację w tle
      await editComment(postId, commentId, newContent);
      
      toast.success('Comment updated');
      
      // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował komentarz
      // Oszczędność: 50 Firebase reads po każdej edycji komentarza
      
    } catch (error) {
      console.error('Error editing comment:', error);
      toast.error('Failed to edit comment');
      
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!address) return;

    // Zabezpieczenie dla komentarzy zapisanych w localStorage ZANIM `addComment`
    // zaczelo zwracac ID z Firestore. Takie wpisy maja `temp-...`, usuwanie szlo
    // pod nieistniejacy dokument i konczylo sie komunikatem o awarii oraz pelnym
    // odswiezeniem feedu. Nowe komentarze dostaja prawdziwe ID od razu.
    if (commentId.startsWith('temp-')) {
      notify.info('This comment is still being saved. Give it a second.');
      return;
    }

    try {
      if (confirm('Are you sure you want to delete this comment?')) {
        // Lustro w cache'u modulu: scalenie po resecie nie moze wskrzesic
        // usunietego komentarza ani jego odpowiedzi.
        forgetCollectionComment(postId, commentId);

        // ✅ OPTIMISTIC UPDATE: Usuń komentarz z UI natychmiast
        const updatedPosts = internalPosts.map(post => {
          if (post.id === postId) {
            // Znika komentarz i jego widoczne odpowiedzi - licznik schodzi
            // o tyle samo, o ile skraca sie lista (serwer liczy tak samo).
            const updatedComments = (post.comments || []).filter(
              comment => comment.id !== commentId && comment.replyTo !== commentId
            );
            const removed = (post.comments?.length || 0) - updatedComments.length;
            return {
              ...post,
              comments: updatedComments,
              commentsCount: Math.max(0, (post.commentsCount ?? post.comments?.length ?? 0) - removed)
            };
          }
          return post;
        });
        
        // Zaktualizuj UI natychmiast
        if (onRefreshPosts) {
          await onRefreshPosts(updatedPosts);
        }
        
        // Wykonaj rzeczywistą operację w tle
        await deleteComment(postId, commentId, address);
        
        toast.success('Comment deleted');
        
        // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już usunął komentarz
        // Oszczędność: 50 Firebase reads po każdym usunięciu komentarza
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
      
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  /**
   * Polubienie komentarza albo odpowiedzi.
   *
   * === CO TU BYLO ZLE ===
   * Dokladnie ten sam zestaw bledow, ktory naprawiono wyzej przy polubieniu posta:
   *
   * 1. Optymistyczna zmiana szla przez `onRefreshPosts(updatedPosts)`, czyli przez
   *    rodzica, ktory na czas swojego dzialania podnosi flage ladowania CALEGO
   *    feedu. Klikniecie serduszka pod jednym komentarzem ruszalo cala liste.
   *
   * 2. Przy bledzie nie bylo wycofania tej jednej zmiany, tylko `onRefreshPosts()`
   *    bez argumentow - pelne odswiezenie listy, a przy pustym cache ponowny
   *    odczyt calego feedu z Firestore za jedno nieudane klikniecie. Do tego
   *    komunikat "Failed to like comment" pojawial sie takze wtedy, gdy zapis
   *    sie powiodl, a wywrocilo sie samo odswiezanie.
   *
   * 3. Komentarz dodany przed chwila mial identyfikator `temp-...`, bo
   *    `addComment` nie zwracalo ID nadanego przez Firestore. Polubienie takiego
   *    komentarza szlo pod nieistniejacy wpis i konczylo sie komunikatem o
   *    awarii. ZRODLO juz naprawione - `addComment` zwraca prawdziwe ID - wiec
   *    ponizszy warunek jest teraz tylko zabezpieczeniem dla wpisow zapisanych
   *    w localStorage PRZED ta zmiana.
   *
   * === JAK JEST TERAZ ===
   * Zmiana lokalnie, cofniecie WYLACZNIE tego jednego komentarza przy bledzie,
   * ta sama zmiana w zapisanych listach (zero odczytow) i osobny, prawdziwy
   * komunikat dla komentarza, ktory dopiero sie zapisuje.
   */
  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!address) {
      notify.info('Connect your wallet to like comments');
      return;
    }

    const post = internalPosts.find(p => p.id === postId);
    const comment = post?.comments?.find(c => c.id === commentId);
    if (!post || !comment) return;

    // Post albo komentarz czekajacy na zapis w Firestore nie ma jeszcze czego polubic.
    if (postId.startsWith('temp-') || commentId.startsWith('temp-')) {
      notify.info('This comment is still being saved. Give it a second.');
      return;
    }

    const wasLiked = !!comment.likedBy?.includes(address);

    // Jedna funkcja uzywana i do stanu widoku, i do zapisanych list - dzieki temu
    // nie da sie ich rozjechac.
    const applyCommentLike = (liked: boolean) => (entry: ExtendedPost): ExtendedPost => {
      if (entry.id !== postId) return entry;
      return {
        ...entry,
        comments: (entry.comments || []).map(c =>
          c.id !== commentId
            ? c
            : {
                ...c,
                likes: Math.max(0, (c.likes || 0) + (liked ? 1 : -1)),
                likedBy: liked
                  ? [...(c.likedBy || []), address]
                  : (c.likedBy || []).filter(id => id !== address),
              }
        ),
      };
    };

    const applyLocally = (liked: boolean) =>
      setInternalPosts(current => current.map(applyCommentLike(liked)));

    // 1. Natychmiastowa reakcja w UI.
    applyLocally(!wasLiked);

    try {
      // 2. Zapis. Dopiero jego niepowodzenie jest bledem polubienia.
      await toggleCommentLike(postId, commentId, address);

      // 3. Ta sama zmiana na ZAPISANYCH listach - bez tego serduszko wracaloby do
      //    poprzedniego stanu po przejsciu na inna zakladke i powrocie, bo widok
      //    odtwarza sie z localStorage.
      patchPostInCache?.(postId, applyCommentLike(!wasLiked));
    } catch (error) {
      console.error('Error toggling comment like:', error);
      // 4. Cofamy TYLKO ten komentarz - reszta listy zostaje nietknieta.
      applyLocally(wasLiked);
      notify.error(
        error instanceof Error && /not found|nie istnieje/i.test(error.message)
          ? 'That comment no longer exists'
          : 'Could not save your like'
      );
    }
  };

  // 🚀 FOLLOW/UNFOLLOW HANDLERS (Obsługa obserwowania/przestawania obserwowania)
  const handleFollowUser = async (targetUserAddress: string) => {
    if (!address || targetUserAddress === address) return;
    
    setFollowLoading(prev => ({ ...prev, [targetUserAddress]: true }));
    
    try {
      const success = await followUser(targetUserAddress);
      if (success) {
        setFollowingStatus(prev => ({ ...prev, [targetUserAddress]: true }));
        toast.success('You now follow this user (Obserwujesz użytkownika)');
      } else {
        notify.error('Could not follow this person');
      }
    } catch (error) {
      console.error('Error following user:', error);
      notify.error('Could not follow this person');
    } finally {
      setFollowLoading(prev => ({ ...prev, [targetUserAddress]: false }));
    }
  };

  // UWAGA: od czasu, gdy obserwowanie jest plusem na awatarze, feed sam z siebie
  // NIE cofa obserwowania - `+` znika, kiedy juz obserwujesz, wiec nie ma tu czego
  // klikac. Cofniecie zyje w BuilderProfile i w liscie Following. Handler zostaje
  // nietkniety i gotowy, bo to logika, a nie warstwa wizualna.
  const handleUnfollowUser = async (targetUserAddress: string) => {
    if (!address || targetUserAddress === address) return;
    
    setFollowLoading(prev => ({ ...prev, [targetUserAddress]: true }));
    
    try {
      const success = await unfollowUser(targetUserAddress);
      if (success) {
        setFollowingStatus(prev => ({ ...prev, [targetUserAddress]: false }));
        toast.success('Unfollowed (Przestałeś obserwować użytkownika)');
      } else {
        notify.error('Could not unfollow this person');
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      notify.error('Could not unfollow this person');
    } finally {
      setFollowLoading(prev => ({ ...prev, [targetUserAddress]: false }));
    }
  };

  // Check follow status when posts change (Sprawdź status obserwowania gdy posty się zmieniają)
  useEffect(() => {
    if (!address || !posts || posts.length === 0) return;

    const checkFollowStatus = async () => {
      // Jedno zapytanie o wlasna liste following i porownanie lokalnie, zamiast
      // seryjnego checkIfFollowing() dla kazdego autora w feedzie.
      const authorAddresses = [...new Set(posts.map(post => post.author))]
        .filter(a => a && a !== address);
      if (authorAddresses.length === 0) return;

      try {
        setFollowingStatus(await getFollowStatuses(authorAddresses));
      } catch (error) {
        console.error('Error checking follow status:', error);
      }
    };

    checkFollowStatus();
  }, [posts, address, getFollowStatuses]);

  const handleAddReply = async (postId: string, commentId: string, txHash?: string) => {
    if (!address || !replyContent.trim()) return;
    
    try {
      const network = resolvePostNetwork(networkChainId);

      // Dodajemy odpowiedź z poprawnie ustawionym polem replyTo
      const newReply = await addCommentReply(postId, commentId, {
        author: address,
        content: replyContent.trim(),
        txHash, // Uproszczona wersja, pozwalamy aby undefined było przekazywane
        network: network
      });
      
      setReplyingTo(null);
      setReplyContent('');
      
      // Optymistyczna aktualizacja UI - dodajemy odpowiedź lokalnie
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          // Tworzymy nową odpowiedź zgodną z typem Comment
          const newReplyComment: Comment = {
            id: newReply.id,
            postId: postId,
            author: address,
            content: replyContent.trim(),
            timestamp: Date.now(),
            likes: 0,
            likedBy: [],
            mentions: [],
            replyTo: commentId, // Kluczowe pole - oznaczamy, że to odpowiedź do konkretnego komentarza
            txHash, // Uproszczona wersja bez null
            network: network // Dodajemy network odpowiedzi
          };

          // Do cache'u modulu - jak przy zwyklym komentarzu.
          rememberCollectionComment(postId, newReplyComment);

          return {
            ...post,
            comments: [
              ...(post.comments || []),
              newReplyComment
            ],
            commentsCount: (post.commentsCount ?? post.comments?.length ?? 0) + 1
          };
        }
        return post;
      });
      
      // Aktualizujemy stan bez pełnego odświeżenia
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      toast.success('Reply added');
    } catch (error) {
      console.error('Error adding reply:', error);
      toast.error('Failed to add reply');
      // W przypadku błędu, pełne odświeżenie
      await refreshPosts();
    }
  };

  const filteredPosts = showOnlyUserPosts ? internalPosts.filter(post => post.author === address) : internalPosts;

  const searchFilteredPosts = filteredPosts.filter(post => {
    const matchesSearch = searchTerm === '' || 
      post.content.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTag = !selectedTag || (post.tags && post.tags.includes(selectedTag));

    const matchesAuthor = !selectedAuthor || post.author === selectedAuthor;

    return matchesSearch && matchesTag && matchesAuthor;
  });

  const sortedPosts = [...searchFilteredPosts].sort((a, b) => {
    if (sortOrder === 'newest') {
      return b.timestamp - a.timestamp;
    } else {
      return a.timestamp - b.timestamp;
    }
  });

  const [displayLimit, setDisplayLimit] = useState(15); // ⚡ OPTYMALIZACJA: Start z 15 postów (-40% Firebase reads)
  const MAX_DISPLAY_LIMIT = 150; // Maksymalnie 150 postów (zmniejszono dla oszczędności)
  const displayedPosts = sortedPosts.slice(0, Math.min(displayLimit, MAX_DISPLAY_LIMIT));

  const loadMorePosts = async () => {
    if (!hasMorePosts || isLoadingMore) return;

    // Bez adresu fetchPosts nie ma po co isc do Firestore, ale wczesniej przycisk
    // po prostu MILCZAL - klikniecie nie robilo nic i nie mowilo dlaczego.
    if (!address) {
      notify.info('Connect your wallet to load more posts');
      return;
    }

    try {
      setIsLoadingMore(true);

      // Kursor paginacji powstaje DOPIERO tutaj, przy pierwszym realnym
      // dociaganiu. Wczesniej osobny efekt (setInitialLastVisible) robil to na
      // KAZDYM moncie listy - czyli szedl do Firestore po te same posty,
      // ktore wlasnie przyszly z cache'u, tylko po to, zeby miec skad zaczac
      // paginacje, ktorej wiekszosc wejsc nigdy nie uzywa. Teraz placi za to
      // wylacznie ten, kto faktycznie dociaga, i tylko raz.
      let cursor = lastVisible;
      if (!cursor) {
        const seeded = await fetchPosts({
          userId: address,
          limit: internalPosts.length || 15,
          ...(showMyFeed ? { authorFilter: address } : {})
        });
        cursor = seeded.lastVisible;
        if (!cursor) {
          setHasMorePosts(false);
          return;
        }
        setLastVisible(cursor);
      }

      // Pobierz następną partię postów
      const { posts: morePosts, lastVisible: newLastVisible } = await fetchPosts({
        userId: address,
        startAfter: cursor,
        limit: 15, // ⚡ OPTYMALIZACJA: Pobieraj 15 postów za razem (-40% Firebase reads)
        ...(showMyFeed ? { authorFilter: address } : {}) // Pobierz tylko posty użytkownika gdy showMyFeed=true
      });
      
      if (morePosts.length > 0) {
        // Sprawdź, czy nowe posty nie są duplikatami (porównaj przez ID)
        const existingPostIds = new Set(internalPosts.map(post => post.id));
        const uniqueNewPosts = morePosts.filter(post => !existingPostIds.has(post.id));
        
        if (uniqueNewPosts.length > 0) {
          // ⚡ OPTYMALIZACJA: Zwiększ displayLimit żeby pokazać nowe posty
          setDisplayLimit(prev => Math.min(prev + uniqueNewPosts.length, MAX_DISPLAY_LIMIT));
          
          // Dodaj nowe posty do istniejących bez resetowania widoku
          if (onRefreshPosts) {
            // Połącz istniejące posty z nowymi
            const allPosts = [...internalPosts, ...uniqueNewPosts];
            await onRefreshPosts(allPosts);
            console.log(`Załadowano ${uniqueNewPosts.length} nowych postów`);
          }
        } else {
          console.log('Brak nowych unikalnych postów do załadowania');
        }
      }
      
      // Zaktualizuj referencję do ostatniego dokumentu
      if (newLastVisible) {
        setLastVisible(newLastVisible);
      }
      
      // Sprawdź, czy są jeszcze posty do załadowania
      setHasMorePosts(morePosts.length > 0);
      
    } catch (error) {
      console.error('Error loading more posts:', error);
      // 🗑️ Wyczyść cache w przypadku błędu
      if (clearPostsCache) {
        clearPostsCache();
      }
      toast.error('Failed to load more posts');
    } finally {
      setIsLoadingMore(false);
    }
  };

  /* ===== INFINITE SCROLL =====
     Przywrocony na zyczenie wlasciciela. Przycisk "Load more posts" zostaje
     jako zapasowe wejscie, ale lista dociaga sie sama, gdy sentinel przed
     przyciskiem podjezdza pod ekran. Obserwator odpala loadMorePosts z tymi
     samymi bezpiecznikami (hasMorePosts, isLoadingMore, limit partii 15),
     wiec koszt odczytow NA PARTIE sie nie zmienia - znika tylko klikanie.
     `rootMargin` 300px: dociaganie rusza chwile przed koncem listy, zeby
     przewijanie nie stawalo na pustym ekranie. */
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || disableInfiniteScroll || !hasMorePosts || isLoadingMore) return;
    if (displayLimit >= MAX_DISPLAY_LIMIT) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMorePosts();
        }
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // displayLimit w zaleznosciach: po kazdej partii obserwator zaklada sie
    // od nowa, wiec na bardzo wysokim ekranie dociagnie kolejna partie od razu.
  }, [disableInfiniteScroll, hasMorePosts, isLoadingMore, displayLimit]);

  // ❌ USUNIĘTO INFINITE SCROLL - oszczędność Firebase reads/writes
  // Teraz tylko przycisk "Load More" będzie kontrolować ładowanie kolejnych postów

  // Stal tu efekt setInitialLastVisible: na kazdym moncie (i przy kazdym
  // optymistycznym updacie, bo deps wisialy na tozsamosci tablicy) szedl do
  // Firestore po te same posty wylacznie po kursor paginacji - razy dwie
  // instancje PostList na ekranie. Kursor zasiewa sie teraz leniwie w
  // loadMorePosts, wiec caly efekt zniknal.

  /**
   * Dociagniecie komentarzy z kolekcji przy rozwinietej sekcji + scalanie
   * po kazdym resecie stanu.
   *
   * Placi ten, kto czyta rozmowe (jeden indeksowany odczyt na post na
   * sesje), nie kazdy, kto przewija feed. Scalanie po id, bo czesc
   * komentarzy zyje w obu miejscach (dual-write sprzed licznikow).
   * Efekt jest SAMONAPRAWIALNY: gdy rodzic podmieni posty (zakladka,
   * cieply cache, awaryjny refetch) i tablica wroci do wersji legacy,
   * kolejny przebieg scala brakujace wpisy z cache'u modulu - bez
   * zadnego nowego odczytu. setState leci TYLKO gdy czegos brakuje,
   * inaczej efekt zapetlilby sie na wlasnej zaleznosci.
   */
  useEffect(() => {
    const mergeFromCache = (postId: string) => {
      const cached = collectionCommentsCache.get(postId);
      if (!cached || cached.length === 0) return;
      const post = internalPosts.find(p => p.id === postId);
      if (!post) return;
      const known = new Set((post.comments || []).map(c => c.id));
      if (!cached.some(c => !known.has(c.id))) return;
      setInternalPosts(current =>
        current.map(p => {
          if (p.id !== postId) return p;
          const have = new Set((p.comments || []).map(c => c.id));
          const missing = cached.filter(c => !have.has(c.id));
          if (missing.length === 0) return p;
          const merged = [...(p.comments || []), ...missing];
          merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          return {
            ...p,
            comments: merged,
            // Kopia posta z baseNameFeed rodzi sie z licznikiem 0 i nikt go
            // tam nie aktualizuje - po scaleniu plakietka nie moze pokazywac
            // mniej, niz stoi na liscie.
            commentsCount: Math.max(p.commentsCount ?? 0, merged.length),
          };
        })
      );
    };

    for (const postId of Object.keys(expandedComments)) {
      if (!expandedComments[postId]) continue;
      if (!internalPosts.some(p => p.id === postId)) continue;
      if (collectionCommentsCache.has(postId)) {
        mergeFromCache(postId);
        continue;
      }
      if (collectionCommentsInflight.has(postId)) continue;
      const request = fetchCommentsForPost(postId)
        .then(fetched => {
          collectionCommentsCache.set(postId, fetched);
          mergeFromCache(postId);
        })
        .catch(error => {
          // Nieudany odczyt nie zamyka drogi - brak wpisu w cache'u sprawia,
          // ze nastepny przebieg sprobuje jeszcze raz.
          console.error('Error hydrating comments:', error);
        })
        .finally(() => {
          collectionCommentsInflight.delete(postId);
        });
      collectionCommentsInflight.set(postId, request);
    }
  }, [expandedComments, internalPosts]);

  useEffect(() => {
    const fetchAllTokenData = async () => {
      // Pobierz tylko posty z adresami zoraCoinAddress, które nie mają jeszcze danych w cache
      const tokenPostsToFetch = internalPosts.filter(post => 
        post.zoraCoinAddress && 
        (!postTokenData[post.id] || !postTokenData[post.id].isFetched)
      );

      if (tokenPostsToFetch.length === 0) return;

      console.log(`Fetching Zora data for ${tokenPostsToFetch.length} new posts...`);

      // Use Promise.allSettled to fetch data for all posts concurrently
      // and handle potential errors for individual posts
      const results = await Promise.allSettled(
        tokenPostsToFetch.map(async (post) => {
          if (!post.zoraCoinAddress) return { postId: post.id, data: null }; // Should not happen due to filter

          // Indicate loading for this specific post
          setIsLoadingTokenData(prev => ({ ...prev, [post.id]: true }));

          try {
            // Timeout dla zapytania, aby uniknąć zawieszenia
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout fetching token data')), 5000)
            );
            
            // Race między rzeczywistym zapytaniem a timeoutem
            const response = await Promise.race([
              getCachedCoin(post.zoraCoinAddress),
              timeoutPromise
            ]) as any;
            
            const tokenInfo = response?.data?.zora20Token as unknown as ZoraApiTokenInfo;
            
            if (tokenInfo) {
              // Basic data extraction - simplified due to typing issues
              const data: ZoraCoinData = {
                totalSupply: tokenInfo.totalSupply || undefined,
                uniqueHolders: tokenInfo.uniqueHolders || undefined,
                symbol: tokenInfo.symbol || 'POST',
                name: tokenInfo.name || 'POST',
                marketCap: tokenInfo.marketCap,
                volume24h: tokenInfo.volume24h,
                createdAt: tokenInfo.createdAt,
                priceUSD: tokenInfo.priceUSD,
                imageUrl: tokenInfo.media?.previewImage || tokenInfo.media?.medium,
                priceChange24h: tokenInfo.priceChange24h,
                isFetched: true // Mark as fetched for caching
              };
              return { postId: post.id, data };
            } else {
              console.warn(`No Zora token data found for address: ${post.zoraCoinAddress}`);
              return { postId: post.id, data: { isFetched: true } }; // Mark as fetched even if no data
            }
          } catch (error) {
            console.error(`Error fetching Zora data for post ${post.id} (${post.zoraCoinAddress}):`, error);
            return { postId: post.id, data: { isFetched: true }, error: true }; // Mark as fetched with error
          } finally {
            // Finish loading for this specific post
            setIsLoadingTokenData(prev => ({ ...prev, [post.id]: false }));
          }
        })
      );

      // Update the state with fetched data
      setPostTokenData(prevData => {
        const newData = { ...prevData };
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value && result.value.data) {
            newData[result.value.postId] = result.value.data;
          } else if (result.status === 'fulfilled' && result.value && result.value.error) {
            // Optionally handle posts where data fetching failed
            if (!newData[result.value.postId]) {
              newData[result.value.postId] = { isFetched: true }; // Mark as attempted
            }
          } else if (result.status === 'rejected') {
            // Handle unexpected promise rejection
            console.error("Unexpected error fetching Zora data:", result.reason);
          }
        });
        return newData;
      });
    };

    if (internalPosts?.length > 0) {
      fetchAllTokenData();
    }

    // Teraz zależymy tylko od długości tablicy postów zamiast całej tablicy
    // co zapobiega niepotrzebnym re-renderom i wielokrotnym zapytaniom API
  }, [internalPosts.length, postTokenData]); // Zmienione zależności

  useEffect(() => {
    // Bez tej flagi zmiana adresu (albo listy postow) w trakcie odczytu sald
    // konczyla sie wpisaniem do stanu odpowiedzi POPRZEDNIEGO portfela - kto
    // pierwszy wrocil z lancucha, ten wygrywal - oraz zgaszeniem wskaznika
    // ladowania nalezacego do juz nieaktualnego zapytania.
    let cancelled = false;

    // Fetch user token balances directly from blockchain (most reliable)
    const fetchUserBalances = async () => {
      if (!address || !publicClient) return;

      try {
        setIsLoadingBalances(true);

        // Get all unique token addresses from posts
        const tokenAddresses = [...new Set(
          internalPosts
            .filter(post => post.zoraCoinAddress)
            .map(post => post.zoraCoinAddress as string)
        )];
        
        if (tokenAddresses.length === 0) {
          setIsLoadingBalances(false);
          return;
        }
        
        const freshBalances: {[tokenAddress: string]: string} = {};
        
        // Fetch balances directly from blockchain using ERC20 balanceOf
        await Promise.all(
          tokenAddresses.map(async (tokenAddress) => {
            try {
              const balance = await publicClient.readContract({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_BALANCE_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`],
              });
              
              const formattedBalance = formatUnits(balance, 18);
              freshBalances[tokenAddress.toLowerCase()] = formattedBalance;
              
              // Save to localStorage cache
              const cacheKey = `token_balance_${address.toLowerCase()}_${tokenAddress.toLowerCase()}`;
              localStorage.setItem(cacheKey, JSON.stringify({
                balance: formattedBalance,
                timestamp: Date.now()
              }));
            } catch (err) {
              console.error(`Error fetching balance for ${tokenAddress}:`, err);
              freshBalances[tokenAddress.toLowerCase()] = '0';
            }
          })
        );
        
        if (!cancelled) setUserTokenBalances(freshBalances);
      } catch (error) {
        console.error('Error fetching user balances:', error);
      } finally {
        if (!cancelled) setIsLoadingBalances(false);
      }
    };

    fetchUserBalances();

    return () => { cancelled = true; };
  }, [address, internalPosts, publicClient]);

  // Function to refresh balances after trade - fetches directly from blockchain
  const refreshBalancesAfterTrade = useCallback(async () => {
    if (!address || !publicClient) return;
    
    try {
      setIsLoadingBalances(true);
      
      // Get all unique token addresses from posts
      const tokenAddresses = [...new Set(
        internalPosts
          .filter(post => post.zoraCoinAddress)
          .map(post => post.zoraCoinAddress as string)
      )];
      
      if (tokenAddresses.length === 0) {
        setIsLoadingBalances(false);
        return;
      }
      
      const freshBalances: {[tokenAddress: string]: string} = {};
      
      // Fetch balances directly from blockchain
      await Promise.all(
        tokenAddresses.map(async (tokenAddress) => {
          try {
            const balance = await publicClient.readContract({
              address: tokenAddress as `0x${string}`,
              abi: ERC20_BALANCE_ABI,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            });
            
            const formattedBalance = formatUnits(balance, 18);
            freshBalances[tokenAddress.toLowerCase()] = formattedBalance;
            
            // Update localStorage cache
            const cacheKey = `token_balance_${address.toLowerCase()}_${tokenAddress.toLowerCase()}`;
            localStorage.setItem(cacheKey, JSON.stringify({
              balance: formattedBalance,
              timestamp: Date.now()
            }));
          } catch (err) {
            console.error(`Error refreshing balance for ${tokenAddress}:`, err);
          }
        })
      );
      
      setUserTokenBalances(prev => ({ ...prev, ...freshBalances }));
    } catch (error) {
      console.error('Error refreshing balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [address, publicClient, internalPosts]);

  // Trading functions removed - now handled by direct links to Zora.co in the UI

  const renderComments = (post: ExtendedPost) => {
    // Split comments into main comments and replies
    const comments = post.comments || [];
    
    // Group by main comments and replies
    const mainComments = comments.filter((c: Comment) => !c.replyTo);
    const repliesByCommentId: {[key: string]: Comment[]} = {};
    
    comments.filter((c: Comment) => c.replyTo).forEach((c: Comment) => {
      if (c.replyTo) {
        if (!repliesByCommentId[c.replyTo]) {
          repliesByCommentId[c.replyTo] = [];
        }
        repliesByCommentId[c.replyTo].push(c);
      }
    });
    
    // ✅ LAZY LOADING KOMENTARZY: Liczba komentarzy do pokazania
    const visibleCount = visibleComments[post.id] || INITIAL_COMMENTS_COUNT;
    const visibleMainComments = mainComments.slice(0, visibleCount);
    const hasMoreComments = mainComments.length > visibleCount;
    
    return (
      <div className="space-y-4">
        <div className="p-4 bg-soft-sunken rounded-card">
            <textarea
              value={newComments[post.id] || ''}
            onChange={(e) => setNewComments(prev => ({...prev, [post.id]: e.target.value}))}
              placeholder="Write a comment..."
            className="w-full p-3 font-soft text-sm leading-[1.55] border border-soft-line rounded-card bg-soft-surface text-soft-ink placeholder:text-soft-ink-faint outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-press)] ease-out-strong focus-visible:ring-2 focus-visible:ring-soft-primary focus:border-soft-line-strong"
              rows={2}
            />
          
            <div className="flex justify-end mt-2">
            {/* Przycisk zalezy od sieci PORTFELA, nie od sieci posta - patrz COMMENT_BUTTON_BY_CHAIN */}
            <ChainCommentButton
              content={newComments[post.id] || ''}
              onTransactionSuccess={(txHash: string) => handleAddComment(post.id, txHash)}
              disabled={!newComments[post.id]?.trim()}
              onCommentAdded={onCommentAdded}
            />
          </div>
        </div>

        {visibleMainComments.map((comment: Comment, index: number) => (
          <div key={comment.id} className={`border-l-2 border-soft-line pl-3 pb-3 ${index > 0 ? 'pt-3 border-t border-soft-line' : ''}`}>
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                {userNames[comment.author]?.avatar ? (
                  <img
                    src={userNames[comment.author].avatar}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <CoinbaseAvatar address={comment.author as `0x${string}`} className="w-8 h-8 rounded-full" />
                )}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center min-w-0">
                      <span className="min-w-0 overflow-hidden font-soft-display font-semibold text-soft-ink">
                        {displayUserName(comment.author, `comment-${comment.id}`, false)}
                      </span>
                      <span className="font-soft text-xs text-soft-ink-faint ml-2">
                        {formatTimestamp(comment.timestamp)}
                      </span>
                      
                      {/* Odznaka sieci komentarza */}
                      <NetworkBadge network={comment.network} size="comment" />
                    </div>
                    {editingComment && editingComment.commentId === comment.id ? (
                      <div className="mt-1">
                        <textarea
                          value={editedCommentContent}
                          onChange={(e) => setEditedCommentContent(e.target.value)}
                          className="w-full p-2 font-soft text-sm leading-[1.55] border border-soft-line rounded-card bg-soft-surface text-soft-ink outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong focus-visible:ring-2 focus-visible:ring-soft-primary focus:border-soft-line-strong"
                          rows={2}
                        />
                        <div className="flex justify-end mt-1 space-x-2">
                          <button
                            onClick={() => handleEditComment(post.id, comment.id, editedCommentContent)}
                            className="px-3 py-1 font-soft text-xs font-bold bg-soft-primary text-white rounded-pill transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingComment(null);
                              setEditedCommentContent('');
                            }}
                            className="px-3 py-1 font-soft text-xs font-bold bg-soft-sunken text-soft-ink-muted rounded-pill transition-[background-color,transform,color] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="font-soft text-sm leading-[1.55] text-soft-ink mt-1 whitespace-pre-wrap break-words">
                        {comment.content}
                      </div>
                    )}
                  </div>
                  
                  {(comment.author === address || address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) && !editingComment && (
                    <div className="flex space-x-1">
                      {comment.author === address && (
                        <button
                          onClick={() => {
                            setEditingComment({ postId: post.id, commentId: comment.id });
                            setEditedCommentContent(comment.content);
                          }}
                          className="text-soft-ink-faint rounded-pill p-0.5 transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                          aria-label="Edit comment"
                          title="Edit comment"
                        >
                          <svg className="w-4 h-4 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteComment(post.id, comment.id)}
                        className="text-soft-ink-faint rounded-pill p-0.5 transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-red-600 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                        aria-label="Delete comment"
                        title="Delete comment"
                      >
                        <svg className="w-4 h-4 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center mt-1 font-soft text-xs text-soft-ink-soft space-x-2">
                  <button
                    onClick={() => handleToggleCommentLike(post.id, comment.id)}
                    aria-pressed={!!comment.likedBy?.includes(address || '')}
                    aria-label={`${comment.likedBy?.includes(address || '') ? 'Unlike' : 'Like'} comment (${comment.likes || 0})`}
                    className={`flex items-center rounded-pill tabular-nums transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                      comment.likedBy?.includes(address || '') ? 'text-soft-primary-deep' : 'hover:text-soft-primary-deep'
                    }`}
                  >
                    {comment.likedBy?.includes(address || '') ? (
                      <svg className="w-4 h-4 mr-1 transform scale-95" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 mr-1 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )}
                    {comment.likes || 0}
                  </button>
                  <button 
                    onClick={() => setReplyingTo({ postId: post.id, commentId: comment.id })}
                    className="flex items-center rounded-pill transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    <svg className="w-4 h-4 mr-1 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Reply
                  </button>
                </div>

                {replyingTo && replyingTo.commentId === comment.id && (
                  <div className="mt-2 pl-3 border-l-2 border-soft-line-strong">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      className="w-full p-2 font-soft text-xs leading-[1.55] border border-soft-line rounded-card bg-soft-sunken text-soft-ink placeholder:text-soft-ink-faint outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong focus-visible:ring-2 focus-visible:ring-soft-primary focus:border-soft-line-strong"
                      rows={2}
                    />
                    <div className="flex justify-end mt-1 space-x-2">
                      <ChainCommentButton
                        content={replyContent}
                        disabled={!replyContent.trim()}
                        onTransactionSuccess={(txHash: string) => handleAddReply(post.id, comment.id, txHash)}
                      />
                    </div>
                  </div>
                )}

                {/* Wyświetlamy odpowiedzi do tego komentarza */}
                {repliesByCommentId[comment.id] && repliesByCommentId[comment.id].length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-soft-line space-y-2">
                    {repliesByCommentId[comment.id].map((reply: Comment, replyIndex: number) => (
                      <div key={reply.id || replyIndex} className={`text-xs ${replyIndex > 0 ? 'mt-2 pt-2 border-t border-soft-line' : ''}`}>
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mt-1">
                            {userNames[reply.author]?.avatar ? (
                              <img
                                src={userNames[reply.author].avatar}
                                alt="Profile"
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <CoinbaseAvatar address={reply.author as `0x${string}`} className="w-6 h-6 rounded-full" />
                            )}
                          </div>
                          <div className="ml-2 flex-1">
                            <div className="flex items-center">
                              <span className="min-w-0 overflow-hidden font-soft-display font-semibold text-soft-ink text-xs">
                                {displayUserName(reply.author, `reply-${comment.id}-${replyIndex}`, false)}
                              </span>
                              <span className="font-soft text-[10px] text-soft-ink-faint ml-1.5">
                                {formatTimestamp(reply.timestamp)}
                              </span>
                              
                              {/* Odznaka sieci odpowiedzi */}
                              <NetworkBadge network={reply.network} size="reply" />
                            </div>
                            <div className="font-soft text-xs leading-[1.55] text-soft-ink mt-0.5 whitespace-pre-wrap break-words">
                              {reply.content}
                            </div>
                            {/* Dodajemy przycisk lajkowania i usuwania odpowiedzi */}
                            <div className="flex items-center mt-1 font-soft text-xs text-soft-ink-soft space-x-2">
                              <button
                                onClick={() => handleToggleCommentLike(post.id, reply.id)}
                                aria-pressed={!!reply.likedBy?.includes(address || '')}
                                aria-label={`${reply.likedBy?.includes(address || '') ? 'Unlike' : 'Like'} reply (${reply.likes || 0})`}
                                className={`flex items-center rounded-pill transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                                  reply.likedBy?.includes(address || '') ? 'text-soft-primary-deep' : 'hover:text-soft-primary-deep'
                                }`}
                              >
                                {reply.likedBy?.includes(address || '') ? (
                                  <svg className="w-3 h-3 mr-0.5 transform scale-95" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 mr-0.5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                  </svg>
                                )}
                                <span className="text-[10px] tabular-nums">{reply.likes || 0}</span>
                              </button>
                              
                              {/* Przycisk usunięcia odpowiedzi - wyświetlany dla autora odpowiedzi lub admina */}
                              {(reply.author === address || address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) && (
                                <button
                                  onClick={() => handleDeleteComment(post.id, reply.id)}
                                  className="flex items-center rounded-pill transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-red-600 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                                  aria-label="Delete reply"
                                  title="Delete reply"
                                >
                                  <svg className="w-3 h-3 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* ✅ LAZY LOADING KOMENTARZY: Przycisk "Load more comments" */}
        {hasMoreComments && (
          <div className="pt-4 border-t border-soft-line">
            <button
              onClick={() => loadMoreComments(post.id)}
              className="w-full py-2 px-4 font-soft text-sm font-semibold text-soft-ink-muted hover:text-soft-ink bg-soft-sunken rounded-pill transition-[color,background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span>Load {Math.min(LOAD_MORE_COMMENTS_COUNT, mainComments.length - visibleCount)} more comments ({mainComments.length - visibleCount} remaining)</span>
            </button>
                  </div>
      )}
    </div>
  );
};

  const renderPost = (post: ExtendedPost) => {
    const isLiked = post.likedBy?.includes(address ?? '');
    const isAuthor = post.author === address;
    // Licznik z dokumentu, nie dlugosc tablicy: nowe komentarze zyja w
    // kolekcji `comments` i w tablicy posta ich nie ma.
    const commentCount = post.commentsCount ?? (post.comments?.length || 0);
    const postDate = formatTimestamp(post.timestamp);
    const canEdit = isAuthor || address?.toLowerCase() === ADMIN_ADDRESS;
    const canDelete = isAuthor || address?.toLowerCase() === ADMIN_ADDRESS;
    const isTextExpanded = expandedTextPosts[post.id] || false;
    const zoraData = postTokenData[post.id];
    const isLoadingData = isLoadingTokenData[post.id];
    // Hashtagi wyliczane raz - wczesniej ten sam parser leciał dwa razy na post
    const hashtags = extractHashtags(post.content);
    // Adres tokena B20 z tresci - `null` w zdecydowanej wiekszosci postow,
    // wiec to jest jedno wyrazenie regularne na post i nic wiecej.
    const b20Address = findB20Address(post.content);

    // Obramowanie karty jest TAKIE SAMO dla przypietych i zwyklych postow.
    // Dziesiec kart pod soba ma czytac sie jak jedna lista, a nie jak zbior
    // ramek o roznej sile - wyroznienie przypiecia niesie pasek i pigulka
    // nizej, nie caly kontur.
    return (
      <div key={`post-${post.id}`} className="bg-soft-surface font-soft rounded-card p-4 border border-soft-line shadow-card relative">
        {/* Przypiecie: waski pasek przy krawedzi zamiast gradientu przez cala
            karte. Poprzednia wersja kladla ciepla plame POD trescia posta, czyli
            obnizala kontrast dokladnie tam, gdzie jest najwazniejszy. */}
        {post.isPinned && (
          <div className="absolute left-0 top-6 bottom-6 w-1 rounded-pill bg-soft-accent pointer-events-none" aria-hidden="true" />
        )}
        <div className="relative z-10">
        {/* Naglowek: DWA POZIOMY zamiast jednego rzedu.
            Wczesniej nazwa, cztery odznaki i data staly w jednej linii, wszystko
            pogrubione i tej samej wielkosci - oko nie mialo za co zlapac. Teraz
            nazwa jest sama w pierwszej linii, a cala reszta (czas, siec, AI,
            PostCoin) schodzi do cichszej linii metadanych pod spodem.
            `min-w-0` + `overflow-hidden` na kolumnie: dlugie nazwy i adresy
            przycinaja sie zamiast rozpychac karte przy 320px. */}
        <div className="flex items-start gap-2.5 mb-2.5">
          <div className="relative flex-shrink-0">
            {userNames[post.author]?.avatar ? (
              <img
                src={userNames[post.author].avatar}
                alt="Profile"
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <CoinbaseAvatar address={post.author as `0x${string}`} className="w-9 h-9 rounded-full" />
            )}

            {/* Obserwowanie SIEDZI NA AWATARZE, a nie w pasku akcji.
                Wczesniej byl to pelnowymiarowy przycisk z napisem "Follow" -
                piata pozycja w rzedzie, ktory na telefonie i tak zawijal sie do
                drugiej linii, i jedyna pozycja paska, ktora nie dotyczy POSTA,
                tylko jego autora. Teraz stoi przy twarzy autora, czyli tam,
                gdzie sie na niego patrzy, i zajmuje 18px zamiast ~90px.

                Znika, gdy juz obserwujesz: `+` to gest DODANIA, nie przelacznik.
                Cofniecie obserwowania zyje na profilu autora i w liscie Following.

                `before:-inset-[11px]` daje 40x40 pola dotykowego wokol
                18-pikselowego znaczka, nie powiekszajac tego, co widac. */}
            {address && post.author !== address && !followingStatus[post.author] && (
              <button
                type="button"
                onClick={() => handleFollowUser(post.author)}
                disabled={followLoading[post.author]}
                title="Follow"
                aria-label={`Follow ${userNames[post.author]?.name || `${(post.author || '').slice(0, 6)}...${(post.author || '').slice(-4)}`}`}
                className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-soft-primary text-white ring-2 ring-soft-surface shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.9] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:opacity-60 before:absolute before:-inset-[11px] before:content-['']"
              >
                {followLoading[post.author] ? (
                  <span className="block w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0 font-soft-display font-semibold text-soft-ink leading-tight">
              <span className="min-w-0 overflow-hidden">
                {displayUserName(post.author, `post-author-${post.id}`, false)}
              </span>

              {/* Agent AI zweryfikowany w KYA. Czlowiek nie dostaje odznaki. */}
              <AgentBadge agent={getAgentInfo(post.author)} loading={agentLookupLoading} />
            </div>

            {/* Linia metadanych - drugi plan. Zawija sie zamiast rozpychac karte. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-soft text-[11.5px] text-soft-ink-soft">
              <span className="tabular-nums">{postDate}</span>
              {post.lastEdited && <span>&middot; edited</span>}

              {/* Odznaka sieci posta - jedna definicja na siec, patrz NETWORK_BADGES */}
              <NetworkBadge network={post.network} size="post" />

              {/* Zora logo and badge */}
              {post.zoraCoinAddress && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-soft-sunken text-soft-ink-muted font-semibold">
                  <img
                    src="/android-chrome-512x512.png"
                    alt="Sphere Token"
                    className="w-3.5 h-3.5"
                    title="This post is a Sphere token"
                  />
                  PostCoin
                </span>
              )}
            </div>
          </div>

          {/* Przypięcie - jedyna odznaka, ktora zostaje mocna, bo przypiecie jest
              platne. Stoi w rogu, wiec nie miesza sie z metadanymi. */}
          {post.isPinned && (
            <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-pill bg-soft-accent-soft">
              <svg
                className="w-3.5 h-3.5 text-soft-accent-deep"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-soft text-[11.5px] text-soft-accent-deep font-semibold">Pinned</span>
            </div>
          )}
        </div>

        {/* Tresc: NAJCIEMNIEJSZY tekst w karcie. Wczesniej byla `text-soft-ink-muted`,
            czyli jasniejsza niz nazwa autora i hashtagi - hierarchia stala na glowie.
            Klasy `prose` nie robily tu nic (wtyczka typography nie jest wpieta),
            wiec zniknely. */}
        <div className="mb-3">
          <div className={`max-w-none whitespace-pre-wrap break-words font-soft text-[15px] leading-[1.6] text-soft-ink ${!isTextExpanded && post.content.length > 500 ? 'max-h-52 overflow-hidden relative' : ''}`}>
            {post.content.split('\n').map((paragraph, index) => (
              paragraph.trim() ? (
                <p key={index} className="mb-2 last:mb-0 break-words whitespace-normal overflow-wrap-anywhere">
                  {paragraph.split(/(\s+)/).map((part, partIndex) => {
                    if (part.startsWith('#')) {
                      return (
                        <span key={partIndex} className="text-soft-primary-deep hover:underline">
                          {part}
                        </span>
                      );
                    }
                    return part;
                  })}
                </p>
              ) : (
                <br key={index} />
              )
            ))}
            {!isTextExpanded && post.content.length > 500 && (
              <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-soft-surface to-transparent"></div>
            )}
          </div>
          
          {post.content.length > 500 && (
            <button
              onClick={() => setExpandedTextPosts(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
              className="font-soft text-soft-primary-deep text-[12.5px] font-semibold mt-1.5 rounded-pill hover:underline transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              {isTextExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
          
          {/* Pasek hashtagów - wyświetla wszystkie hashtagi, nawet te niewidoczne.
              Ten sam tekst stoi juz w tresci powyzej, wiec pigulki sa CICHE:
              powtorzenie w tym samym, mocnym kolorze robilo z konca kazdej karty
              drugi, konkurencyjny akapit. */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block max-w-full truncate px-2 py-0.5 bg-soft-sunken text-soft-ink-soft font-soft text-[11.5px] font-medium rounded-pill"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 💰 Tip-to-unlock: renderowane WYLACZNIE dla postow z trescia premium.
            Post bez tych pol nie renderuje tu niczego. */}
        {hasPremiumContent(post) && (
          <PremiumGate
            postId={post.id}
            creatorAddress={post.author}
            unlockPrice={post.unlockPrice as string}
            unlockToken={post.unlockToken}
            isUnlocked={unlockedPostIds.has(post.id)}
            onUnlocked={markUnlocked}
          />
        )}

        {/* ===== KARTA TOKENA B20 =====
            Post, ktory niesie adres tokena B20, dostaje pod trescia karte
            z logotypem, cena i przyciskiem kupna - dokladnie jak podglad linku
            obok, i z tego samego powodu: tresc niesie adres, a interfejs go
            rozwija.

            Wykrywane z TRESCI, a nie z pola w bazie. Dzieki temu dziala takze
            dla postow napisanych wczesniej i dla adresow wklejonych recznie,
            a sciezka zapisu, reguly Firestore i optymistyczny post w feedzie
            zostaja nietkniete - czyli zero nowych miejsc do rozjechania.

            Nieudany odczyt nie renderuje NICZEGO (patrz B20PostCard): pusta
            ramka pod postem wygladalaby jak zepsuty post, a nie jak nieudane
            zapytanie - i obwinialaby autora za nasza awarie. */}
        {b20Address && <B20PostCard address={b20Address} />}

        {/* Zawsze umieszczaj LinkPreview tutaj, pod treścią posta */}
        <LinkPreview content={post.content} />

        {/* Media (obrazek lub wideo) */}
        {(post.image || post.video) && (
          <div
            className="my-3 cursor-pointer rounded-card outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            onClick={() => {
              const mediaUrl = post.image || post.video;
              if (mediaUrl) {
                setEnlargedImage(mediaUrl);
              }
            }}
            {...(post.image && !post.video
              // Klawiatura tylko dla obrazka. Wideo ma wlasne kontrolki, ktore
              // same lapia Enter/Spacje - rola "button" na kontenerze by je zjadla.
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  'aria-label': 'Enlarge image',
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    setEnlargedImage(post.image as string);
                  },
                }
              : {})}
          >
            {/* Kontener rezerwuje miejsce zanim media sie zaladuja - bez tego kazdy
                obraz w feedzie przesuwal wszystko ponizej (CLS). images.unoptimized
                jest wlaczone, wiec Next nie doda wymiarow za nas. */}
            {post.image && (
              <div className="relative w-full aspect-[16/10] max-h-96 overflow-hidden rounded-card bg-soft-sunken">
                <img
                  src={post.image}
                  alt="Post media"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
            )}
            {post.video && (
              <div className="relative w-full aspect-[16/10] max-h-96 overflow-hidden rounded-card bg-soft-sunken">
                <video src={post.video} controls preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
              </div>
            )}
          </div>
        )}

        {/* 🎵 Music Track - wyświetlaj kafelek muzyczny jeśli post ma załączony utwór */}
        {post.musicTrack && (
          <div className="my-3">
            <PostAudioPlayer musicTrack={post.musicTrack} />
          </div>
        )}

        {/* --- NEW ZORA TOKEN INFO & ACTIONS SECTION --- */}
        {post.zoraCoinAddress && (
          <div className="mt-4 mb-2">
            {/* ===== KARTA MONETY BEZ EFEKTU REFLEKTORA =====
                Byla tu <SpotlightCard/>: fioletowa poswiata podazajaca za
                kursorem. Na telefonie nie ma kursora, wiec efekt nie robil tam
                nic poza dodaniem kolejnej warstwy kompozytowej - tej samej
                rodziny co filtry rozmycia, ktore dawaly pasy na GPU Androida.
                Na desktopie swiecil pod karta o pieniadzach, gdzie uwage ma
                trzymac kwota, a nie oprawa.

                Zwykla karta produktu. Zawartosc, liczby i przyciski bez
                jednej zmiany. */}
            <div className="rounded-card border border-soft-line bg-soft-sunken shadow-card">
              <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  {zoraData?.imageUrl ? (
                    <div className="relative">
                      <img 
                        src={zoraData.imageUrl} 
                        alt={zoraData?.name || 'Token'} 
                        className="h-10 w-10 rounded-full"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <img 
                        src="/android-chrome-512x512.png" 
                        alt="Sphere Logo" 
                        className="h-10 w-10 rounded-full"
                      />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <CardTitle className="font-soft-display text-lg font-bold text-soft-primary-deep m-0">
                        {zoraData?.symbol || 'POSTCOIN'}
                      </CardTitle>
                      {zoraData?.priceUSD && (
                        <Badge variant="secondary" className="rounded-pill bg-soft-surface font-soft-display text-xs font-bold tabular-nums text-soft-ink">
                          ${formatNumberWithSuffix(zoraData.priceUSD)}
                        </Badge>
                      )}
                      {/* Kierunek zmiany niesie sam KOLOR TEKSTU. Wczesniej doszedl
                          do tego jaskrawy kontur, przez co zmiana ceny krzyczala
                          glosniej niz kwota tipa - jedyna liczba w karcie, ktorej
                          nie da sie nabic. */}
                      {zoraData?.priceChange24h !== undefined && (
                        <Badge
                          variant="outline"
                          className={`rounded-pill border-0 bg-transparent px-0 font-soft-display text-xs font-bold tabular-nums ${
                            zoraData.priceChange24h > 0
                              ? 'text-green-700'
                              : zoraData.priceChange24h < 0
                                ? 'text-red-700'
                                : 'text-soft-ink-soft'
                          }`}
                        >
                          {zoraData.priceChange24h > 0 ? '↑' : zoraData.priceChange24h < 0 ? '↓' : ''}
                          {Math.abs(zoraData.priceChange24h).toFixed(2)}%
                        </Badge>
                      )}
                    </div>
                    {zoraData?.name && zoraData.name !== zoraData?.symbol && (
                      <p className="font-soft text-xs text-soft-ink-soft mt-0.5">
                        {zoraData.name}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {isLoadingData ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-soft-primary"></div>
                  </div>
                ) : (
                  <>
                    {/* Token Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <Card className="rounded-2xl border-0 bg-soft-surface shadow-none">
                        <CardContent className="p-3">
                          <div className="font-soft text-[11px] text-soft-ink-soft mb-0.5">Holders</div>
                          <div className="font-soft-display text-base font-bold tabular-nums text-soft-ink">{zoraData?.uniqueHolders || '0'}</div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-2xl border-0 bg-soft-surface shadow-none">
                        <CardContent className="p-3">
                          <div className="font-soft text-[11px] text-soft-ink-soft mb-0.5">Supply</div>
                          <div className="font-soft-display text-base font-bold tabular-nums text-soft-ink">
                            {zoraData?.totalSupply 
                              ? formatNumberWithSuffix(parseFloat(zoraData.totalSupply))
                              : '0'}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-2xl border-0 bg-soft-surface shadow-none">
                        <CardContent className="p-3">
                          <div className="font-soft text-[11px] text-soft-ink-soft mb-0.5">Your Balance</div>
                          <div className="font-soft-display text-base font-bold tabular-nums text-soft-ink">
                            {isLoadingBalances 
                              ? '...' 
                              : (function() {
                                  if (!post.zoraCoinAddress) return '0';
                                  const balanceStr = userTokenBalances[post.zoraCoinAddress.toLowerCase()];
                                  if (!balanceStr) return '0';
                                  try {
                                    const balanceNum = parseFloat(balanceStr);
                                    if (isNaN(balanceNum) || balanceNum === 0) return '0';
                                    return formatNumberWithSuffix(balanceNum);
                                  } catch (e) {
                                    return '0';
                                  }
                                })()
                            }
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Market Data Row */}
                    {(zoraData?.marketCap || zoraData?.volume24h) && (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {zoraData?.marketCap && (
                          <Card className="rounded-2xl border-0 bg-soft-surface shadow-none">
                            <CardContent className="p-3">
                              <div className="font-soft text-[11px] text-soft-ink-soft mb-0.5">Market Cap</div>
                              <div className="font-soft-display text-base font-bold tabular-nums text-soft-ink">
                                ${formatNumberWithSuffix(zoraData.marketCap)}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                        {zoraData?.volume24h && (
                          <Card className="rounded-2xl border-0 bg-soft-surface shadow-none">
                            <CardContent className="p-3">
                              <div className="font-soft text-[11px] text-soft-ink-soft mb-0.5">24h Volume</div>
                              <div className="font-soft-display text-base font-bold tabular-nums text-soft-ink">
                                ${formatNumberWithSuffix(zoraData.volume24h)}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                    
                    {/* Trade Buttons */}
                    {address && post.zoraCoinAddress && (
                      <div className="pt-3 border-t border-soft-line">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const coinData: CreatorCoinData = {
                                address: post.zoraCoinAddress!,
                                name: zoraData?.name || postTokenData[post.id]?.name || 'Post Token',
                                symbol: zoraData?.symbol || postTokenData[post.id]?.symbol || 'TOKEN',
                                totalSupply: zoraData?.totalSupply || '0',
                                marketCap: zoraData?.marketCap,
                                priceUSD: zoraData?.priceUSD,
                                volume24h: zoraData?.volume24h,
                                uniqueHolders: zoraData?.uniqueHolders,
                                imageUrl: post.image || zoraData?.imageUrl || postTokenData[post.id]?.imageUrl,
                              };
                              setTradeCoinData(coinData);
                              setTradeCoinBalance(userTokenBalances[post.zoraCoinAddress!.toLowerCase()] || '0');
                              setTradeCoinMode('buy');
                              setShowTradeCoinModal(true);
                            }}
                            className="flex-1 py-2 px-3 rounded-pill font-soft text-sm font-bold bg-soft-primary text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => {
                              const coinData: CreatorCoinData = {
                                address: post.zoraCoinAddress!,
                                name: zoraData?.name || postTokenData[post.id]?.name || 'Post Token',
                                symbol: zoraData?.symbol || postTokenData[post.id]?.symbol || 'TOKEN',
                                totalSupply: zoraData?.totalSupply || '0',
                                marketCap: zoraData?.marketCap,
                                priceUSD: zoraData?.priceUSD,
                                volume24h: zoraData?.volume24h,
                                uniqueHolders: zoraData?.uniqueHolders,
                                imageUrl: post.image || zoraData?.imageUrl || postTokenData[post.id]?.imageUrl,
                              };
                              setTradeCoinData(coinData);
                              setTradeCoinBalance(userTokenBalances[post.zoraCoinAddress!.toLowerCase()] || '0');
                              setTradeCoinMode('sell');
                              setShowTradeCoinModal(true);
                            }}
                            className="flex-1 py-2 px-3 rounded-pill font-soft text-sm font-bold bg-soft-surface text-soft-primary-deep border border-soft-line-strong transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                          >
                            Sell
                          </button>
                        </div>
                        {/* User Balance */}
                        {userTokenBalances[post.zoraCoinAddress.toLowerCase()] && 
                         parseFloat(userTokenBalances[post.zoraCoinAddress.toLowerCase()]) > 0 && (
                          <div className="mt-2 text-center">
                            <span className="font-soft text-xs text-soft-ink-soft">
                              Your balance: <span className="font-soft-display font-bold tabular-nums text-soft-ink">
                                {parseFloat(userTokenBalances[post.zoraCoinAddress.toLowerCase()]).toFixed(4)} {zoraData?.symbol || 'TOKEN'}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* External Links - wyrownane do lewej, jak reszta karty.
                        Wysrodkowany rzad czterech linkow czytal sie jak stopka
                        strony, a nie jak dodatek do panelu tokena. */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-soft-line">
                      {post.zoraCoinAddress && userTokenBalances[post.zoraCoinAddress.toLowerCase()] && 
                       parseFloat(userTokenBalances[post.zoraCoinAddress.toLowerCase()]) > 0 && (
                        <a 
                          href={`https://zora.co/profile/${address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-soft text-[11.5px] font-semibold text-soft-ink-soft hover:text-soft-primary-deep flex items-center gap-1 rounded-pill transition-[color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                        >
                          View your tokens
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      
                      <a
                        href={`${getTokenExplorer(post.network).tokenUrl}${post.zoraCoinAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-soft text-[11.5px] font-semibold text-soft-ink-soft hover:text-soft-primary-deep flex items-center gap-1 rounded-pill transition-[color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                      >
                        View on {getTokenExplorer(post.network).name}
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                      
                      <a 
                        href={`https://zora.co/coin/base:${post.zoraCoinAddress}?referrer=0xf1fa20027b6202bc18e4454149c85cb01dc91dfd`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-soft text-[11.5px] font-semibold text-soft-ink-soft hover:text-soft-primary-deep flex items-center gap-1 rounded-pill transition-[color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                      >
                        View on Zora
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      
                      <a 
                        href={`https://dexscreener.com/base/${post.zoraCoinAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-soft text-[11.5px] font-semibold text-soft-ink-soft hover:text-soft-primary-deep flex items-center gap-1 rounded-pill transition-[color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                      >
                        View on DexScreener
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            </div>
          </div>
        )}
        {/* --- END NEW ZORA TOKEN INFO & ACTIONS --- */}

        {/* ⏳ Pending Pin Timer - Shows while waiting for confirmation */}
        {pendingPins[post.id] && (
          <div className="mt-3">
            <PendingPinTimer
              postId={post.id}
              txHash={pendingPins[post.id].txHash}
              expectedAt={pendingPins[post.id].expectedAt}
              duration={pendingPins[post.id].duration as PinDuration}
            />
          </div>
        )}

        {/* 🚀 Pin Timer for Confirmed Paid Pins */}
        {post.isPinned && post.isPaidPin && post.pinExpiresAt && !pendingPins[post.id] && (
          <div className="mt-3">
            <PinTimer
              postId={post.id}
              expiresAt={post.pinExpiresAt}
              isPaidPin={true}
              pinOwner={post.pinOwner}
              duration={post.pinDuration as PinDuration}
              onExtendClick={() => {
                setExtendingPostId(post.id);
                setExtendingExpiresAt(post.pinExpiresAt || 0);
                setShowExtendModal(true);
              }}
            />
          </div>
        )}

        {/* Pasek akcji: CICHY, dopoki sie w niego nie celuje.
            Wszystkie pozycje maja ten sam kolor spoczynkowy (ink-soft), ten sam
            skok na hover (tlo sunken + primary), te sama ikone 16px i to samo
            pole klikalne 40x40 - patrz ACTION_ITEM / ACTION_ICON u gory pliku.
            Ponizej `sm` zostaja SAME IKONY; napisy wracaja od `sm` w gore.
            "Follow" wyprowadzony stad na awatar autora.
            `flex-wrap`: przy 320px pasek schodzi do drugiej linii zamiast
            rozpychac karte w bok. */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 font-soft text-soft-ink-soft mt-3 pt-1.5 border-t border-soft-line">
          <button
            onClick={() => handleToggleLike(post.id)}
            className={`${ACTION_ITEM} disabled:opacity-50 ${isLiked ? 'text-soft-primary-deep' : ''}`}
            disabled={!isConnected}
            aria-pressed={!!isLiked}
            aria-label={`${isLiked ? 'Unlike' : 'Like'} post (${post.likes || 0})`}
          >
            <svg className={ACTION_ICON} fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {/* Licznik to nie napis, tylko tresc akcji - zostaje na kazdej szerokosci. */}
            <span className="tabular-nums">{post.likes || 0}</span>
          </button>

          <button
            onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
            className={ACTION_ITEM}
            aria-expanded={!!expandedComments[post.id]}
            aria-label={`Comments (${commentCount})`}
          >
            <svg className={ACTION_ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="tabular-nums">{commentCount}</span>
          </button>

          {/* 💰 Paid Pin Button - Show for non-pinned posts */}
          <PaidPinButton
            postId={post.id}
            postContent={post.content}
            authorAddress={post.author}
            isPinned={!!post.isPinned}
            className={ACTION_ITEM_PAID}
            onPinSuccess={(txHash: string, duration: PinDuration) => {
              if (onPinPending) {
                onPinPending(post.id, txHash, duration);
              }
            }}
          />

          {/* Tip Button - Show for all posts */}
          <TipButton
            recipientAddress={post.author}
            postId={post.id}
            className={ACTION_ITEM_EXTERNAL}
          />

          {/* Udostepnianie STOI W PASKU AKCJI, obok polubienia i tipa.
              Wczesniej bylo w osobnym rzedzie pod postem - czyli w miejscu,
              w ktorym nikt nie szuka akcji, bo wszystkie pozostale sa tutaj.
              Prowadzi do /post/[id]: strony z pelnymi metadanymi, wlasna karta
              OG i natywnym arkuszem udostepniania systemu. */}
          <a
            href={`/post/${post.id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open this post on its own page to share it"
            title="Share"
            className={ACTION_ITEM}
          >
            <svg className={ACTION_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {/* Napis chowal sie tu jako JEDYNY nigdy - obok Tipa i Supportu,
                ktore ponizej `sm` sa samymi ikonami, Share byl dwa razy szerszy. */}
            <span className={ACTION_LABEL}>Share</span>
          </a>

          {/* 🤝 Wsparcie tworcy na okres - platnosc Z GORY, bez odnawiania.
              Stan bierze sie ze zbiorczego sprawdzenia dla calego feedu. */}
          <SubscribeButton
            creatorAddress={post.author}
            creatorName={userNames[post.author]?.name}
            isSupported={subscribedCreators.has((post.author || '').toLowerCase())}
            onSubscribed={markSubscribed}
            className={ACTION_ITEM_SUPPORT}
          />

          {post.txHash && (
            <a
              href={`${getTxExplorer(post.network).txUrl}${post.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_ITEM}
              title="View Transaction"
              aria-label="View this post's transaction in the block explorer"
            >
              <svg className={ACTION_ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {/* Napis wraca od `sm`, tak jak w kazdej innej pozycji paska -
                  wczesniej ten jeden chowal sie dopiero od `md`. */}
              <span className={ACTION_LABEL}>Transaction</span>
            </a>
          )}

          {/* 🗑️ ADMIN DELETE BUTTON - Dedykowana ikonka dla admina */}
          {address && isUserAdmin(address) && post.author !== address && (
            <button
              // handleDeletePost sam pyta o potwierdzenie - drugie `confirm` tutaj
              // oznaczalo, ze admin musial potwierdzic usuniecie DWA razy, a klikniecie
              // "Anuluj" w drugim okienku wygladalo, jakby przycisk nie zadzialal.
              onClick={() => handleDeletePost(post.id)}
              // Czerwien pojawia sie DOPIERO pod kursorem. Stala, czerwona ikona
              // w kazdej karcie widzianej przez admina byla trzecim mocnym kolorem
              // w pasku, w ktorym reszta jest szara.
              className={`${ACTION_ITEM} ml-auto hover:!text-red-600 hover:!bg-red-50`}
              title="Delete post (Admin)"
              aria-label="Delete post (Admin)"
            >
              <svg className={ACTION_ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          {/* Menu bylo wczesniej ZAGNIEZDZONE w przycisku - przycisk w przycisku
              to niepoprawny HTML (React ostrzega, hydracja potrafi to przestawic).
              Teraz menu jest rodzenstwem przycisku, a `group` siedzi na otoczce,
              wiec hover dziala dokladnie tak samo. */}
          {(canEdit || (canDelete && post.author === address)) && (
            <div className="relative ml-auto group">
              <button
                type="button"
                className={ACTION_ITEM}
                aria-label="Post options"
                title="Post options"
              >
                <svg className={ACTION_ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
              </button>
              {/* Popover skaluje sie od SWOJEGO przycisku (origin-bottom-right),
                  nie od srodka - inaczej wyglada, jakby przylecial znikad. */}
              <div className="absolute right-0 bottom-full mb-1 w-32 bg-soft-surface rounded-card shadow-float py-1 opacity-0 scale-95 origin-bottom-right group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 transition-[opacity,transform] duration-200 ease-out-strong z-10 border border-soft-line pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                {canEdit && (
                  <button
                    onClick={() => { setEditingPost(post.id); setEditedContent(post.content); }}
                    className="block w-full text-left px-4 py-2 font-soft text-xs font-semibold text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink transition-[color,background-color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    Edit
                  </button>
                )}
                {address && isUserAdmin(address) && (
                  <button
                    onClick={() => post.isPinned ? handleUnpinPost(post.id) : handlePinPost(post.id)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left font-soft text-xs font-semibold hover:bg-soft-sunken transition-[color,background-color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                      post.isPinned
                        ? 'text-soft-accent-deep'
                        : 'text-soft-ink-muted hover:text-soft-ink'
                    }`}
                  >
                    {/* Ikona wektorowa zamiast emoji 📌 - emoji renderuje sie inaczej
                        na kazdym systemie i nie da sie go dopasowac do reszty menu. */}
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3l6 6-3 1-4 4-1 5-2 2-3-3-5 5 5-5-3-3 2-2 5-1 4-4 1-3z" />
                    </svg>
                    {post.isPinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                {/* ✅ TYLKO AUTOR może usuwać przez menu (admin ma dedykowaną ikonkę) */}
                {canDelete && post.author === address && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="block w-full text-left px-4 py-2 font-soft text-xs font-semibold text-red-600 hover:bg-red-50 transition-[background-color] [transition-duration:var(--dur-press)] ease-out-strong outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Udostepnianie przeniesione DO PASKA AKCJI obok polubienia i tipa -
            wczesniej stalo w osobnym rzedzie pod postem, czyli w miejscu,
            w ktorym nikt nie szuka akcji. Otwiera /post/[id]: strone z pelnymi
            metadanymi, wlasna karta OG i natywnym arkuszem udostepniania. */}

        {/* Tip Stats - Always under action buttons for better layout.
            Kwota tipa to jedyna liczba w karcie, ktorej nie da sie nabic - i
            jedyne miejsce, ktore dostaje `soft-accent`. */}
        <div className="mt-1.5">
          <TipStats
            postId={post.id}
            presetPostStats={postTipStats[post.id] ?? null}
            presetLoading={tipStatsLoading}
            presetFailed={tipStatsFailed}
            className="font-soft-display tabular-nums text-soft-accent-deep"
          />
        </div>

        {editingPost === post.id && (
          <div className="mt-4">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full px-3 py-2 font-soft text-sm leading-[1.55] border border-soft-line rounded-card bg-soft-surface text-soft-ink outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong focus-visible:ring-2 focus-visible:ring-soft-primary focus:border-soft-line-strong"
              rows={3}
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={() => setEditingPost(null)}
                className="px-3 py-1 font-soft text-xs font-bold bg-soft-sunken text-soft-ink-muted rounded-pill transition-[color,background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                Cancel
              </button>
              <button
                 onClick={() => handleEditPost(post.id, editedContent)}
                 className="px-3 py-1 font-soft text-xs font-bold bg-soft-primary text-white rounded-pill transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                 Save
               </button>
            </div>
          </div>
        )}

        {expandedComments[post.id] && (
          <div className="mt-4 pt-4 border-t border-soft-line">
            {renderComments(post)}
          </div>
        )}
        </div>
      </div>
    );
  };

  if (isLoading && internalPosts.length === 0) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-soft-surface rounded-card border border-soft-line p-4 shadow-card">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-soft-sunken rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-soft-sunken rounded-pill w-1/4 mb-2"></div>
                <div className="h-3 bg-soft-sunken rounded-pill w-1/6"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-soft-sunken rounded-pill"></div>
              <div className="h-4 bg-soft-sunken rounded-pill w-5/6"></div>
              <div className="h-4 bg-soft-sunken rounded-pill w-4/6"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (internalPosts.length === 0 && !isLoading) {
    return (
      <div className="bg-soft-surface rounded-card p-8 shadow-card text-center">
        {/* Ikona wektorowa zamiast emoji - emoji jako ikona wyglada na wstawke,
            a nie na czesc interfejsu. */}
        <svg className="mx-auto mb-4 h-10 w-10 text-soft-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-2.4 6A2 2 0 0115.7 21H8.3a2 2 0 01-1.9-1.4L4 13m16 0h-5l-1 2h-4l-1-2H4" />
        </svg>
        <h3 className="font-soft-display text-lg font-bold text-soft-ink mb-2">No posts found</h3>
        <p className="font-soft text-soft-ink-muted leading-[1.55]">
          {showOnlyUserPosts 
            ? "You haven't created any posts yet." 
            : "There are no posts matching your search criteria."}
        </p>
      </div>
    );
  }

  return (
    // Karty nie maja juz wlasnego `mb-4` - odstep na liscie jest JEDEN i stoi
    // tutaj. Wczesniej margines karty sumowal sie z odstepem listy, przez co
    // miedzy postami bylo 40px pustki.
    <div className="space-y-3">
      {displayedPosts.map(post => (
        <React.Fragment key={`post-fragment-${post.id}`}>
          {renderPost(post)}
        </React.Fragment>
      ))}
      
      {/* Sentinel dla infinite scroll - patrz obserwator przy loadMorePosts. */}
      {!disableInfiniteScroll && hasMorePosts && displayLimit < MAX_DISPLAY_LIMIT && (
        <div ref={loadMoreSentinelRef} aria-hidden="true" className="h-px" />
      )}

      {/* Load More Button - Hidden for pinned posts */}
      {!disableInfiniteScroll && displayLimit < MAX_DISPLAY_LIMIT && (
        <div className="flex justify-center p-4">
          {isLoadingMore ? (
            <div className="animate-pulse space-y-4 w-full">
              <div className="bg-soft-sunken h-10 rounded-pill"></div>
            </div>
          ) : hasMorePosts ? (
            // Jeden przycisk, jeden cien, zero ozdob. Poprzednia wersja miala
            // emoji, pulsujaca kropke, dwie nakladki i cien "float" zarezerwowany
            // dla elementow unoszacych sie NAD trescia (menu, modale).
            <button
              onClick={loadMorePosts}
              className="px-6 py-3 bg-soft-primary text-white rounded-pill font-soft text-sm font-bold shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              Load more posts
            </button>
          ) : internalPosts.length > 0 ? (
            <div className="text-center p-4">
              <div className="font-soft text-soft-ink-muted text-sm mb-1">You&apos;ve reached the end</div>
              <div className="font-soft text-soft-ink-faint text-xs">All posts have been loaded</div>
            </div>
          ) : null}
        </div>
      )}

      {/* Informacja o limicie wyświetlania */}
      {!disableInfiniteScroll && displayLimit >= MAX_DISPLAY_LIMIT && internalPosts.length > MAX_DISPLAY_LIMIT && (
        <div className="text-center p-4">
          {/* Limit wyswietlania to komunikat interfejsu, a nie kwota - stad
              `soft-ink`, a nie zarezerwowany dla pieniedzy `soft-accent`. */}
          <div className="font-soft text-soft-ink text-sm font-semibold mb-1">Display limit reached</div>
          <div className="font-soft text-soft-ink-faint text-xs">
            Showing {MAX_DISPLAY_LIMIT} most recent posts for performance
          </div>
        </div>
      )}

      {/* rgba to --soft-ink (#2E2A44) przy 85%. Modyfikator alfy (bg-soft-ink/85)
          nie dziala na tokenach zapisanych jako var() - patrz komentarz przy
          nakladce przypiecia wyzej. */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-soft-ink/85"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-auto">
            <img 
              src={enlargedImage} 
              alt="Enlarged post image"
              className="object-contain max-h-[90vh] rounded-card"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 text-white bg-soft-ink/70 rounded-pill p-2 transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-ink active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              onClick={() => setEnlargedImage(null)}
              aria-label="Close image"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Extend Pin Modal - moved to the top level */}
      <ExtendPinModal
        isOpen={showExtendModal}
        onClose={() => {
          setShowExtendModal(false);
          setExtendingPostId(null);
          setExtendingExpiresAt(0);
        }}
        postId={extendingPostId || ''}
        currentExpiresAt={extendingExpiresAt}
        onExtendSuccess={(txHash: string, additionalDuration: PinDuration) => {
          console.log('Pin extended successfully:', { postId: extendingPostId, txHash, additionalDuration });
          setShowExtendModal(false);
          // Refresh posts to show updated expiration
          if (onRefreshPosts) {
            onRefreshPosts();
          }
        }}
      />

      {/* Trade Coin Modal */}
      {showTradeCoinModal && tradeCoinData && (
        <TradeCoinModal
          isOpen={showTradeCoinModal}
          onClose={() => {
            setShowTradeCoinModal(false);
            setTradeCoinData(null);
          }}
          coin={tradeCoinData}
          userBalance={tradeCoinBalance}
          mode={tradeCoinMode}
          onTradeSuccess={refreshBalancesAfterTrade}
        />
      )}
    </div>
  );
}

// Feed jest najciezszym poddrzewem na stronie - bez memo kazde nacisniecie klawisza
// w kompozytorze posta re-renderowalo wszystkie posty. Propsy sa stabilne
// (useCallback / module-level fn / useState), wiec plytkie porownanie wystarcza.
export default memo(PostList);
