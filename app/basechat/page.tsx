'use client';

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import PremiumComposer, { EMPTY_PREMIUM, type PremiumComposerValue } from '../components/monetization/PremiumComposer';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { isRouteDisabled } from '@/config/routeStatus';
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { useSiweAuth } from '../utils/auth/useSiweAuth';
import { base, baseSepolia } from 'wagmi/chains';
// Warstwa tozsamosci na wagmi/viem - zamiennik @coinbase/onchainkit/identity
import { Avatar, useName } from '../components/identity';
// Zawezone do tego, co ta strona faktycznie wola. Wypadly importy po skasowanych
// martwych handlerach (addComment, toggleLike, toggleCommentLike, editComment,
// deleteComment, addCommentReply, deletePost) oraz takie, ktorych nikt tu nigdy
// nie uzyl: updateUserName, getBulkUserNamesOptimized, getCachedActiveUsers,
// clearPaginatedActiveUsersCache, getPaginatedActiveUsersCacheInfo,
// getGlobalStats, refreshTop50UsersOnly, pinPost, unpinPost, isUserAdmin.
import {
  saveUserProfile,
  createPost,
  fetchPosts,
  fetchBaseNameFeedPosts, // Import nowej funkcji
  fetchUserProfile,
  db,
  getBulkUserNamesVisibleOnly,
  getUserNamesCacheStats,
  saveProfileName,
  getProfileName,
  ADMIN_ADDRESS,
  getTopActiveUsersPaginated, // 🚀 NOWA FUNKCJA PAGINOWANA
  clearUserNamesCache
} from '../utils/firebase';
import { doc, updateDoc, serverTimestamp, getDoc, setDoc, increment } from 'firebase/firestore';
import { Post, Stats } from '../types';
import { UserRank } from '../utils/ranking';
import Script from 'next/script';
import { put } from '@vercel/blob';
import { useSearchParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import BanMessage from '../admin/components/BanMessage';
import { useBanStatus } from '../hooks/useBanStatus';
const ReferralLeaderboard = dynamic(() => import('../utils/referrals/components/ReferralLeaderboard'), { ssr: false });
import BuilderProfile from './components/BuilderProfile';
const FollowingView = dynamic(() => import('./friendsystem/FollowingView'), { ssr: false });
const FriendsView = dynamic(() => import('./friendsystem/FriendsView'), { ssr: false });
const DiscoverView = dynamic(() => import('./friendsystem/DiscoverView'), { ssr: false });

const NotificationsView = dynamic(() => import('./friendsystem/NotificationsView'), { ssr: false });

import { RefreshCw } from 'lucide-react';
import TransactionButton from '../components/TransactionButton';
import { toast } from 'react-hot-toast';
const YapsMetrics = dynamic(() => import('../yapscan/components/YapsMetrics'), { ssr: false });


import PostList, { ExtendedPost } from './components/PostList';
import ProfileCard from './components/ProfileCard';
import PinnedPosts from './components/PinnedPosts';
import FeedAskRail, { ASKS_RAIL_CACHE_KEY } from './components/FeedAskRail';
// Zakladanie Aska Z FEEDU. Kompozytor i karta sa te same, ktore stoja na
// /asks - drugi formularz dotykajacy pieniedzy bylby drugim miejscem, w
// ktorym trzeba naprawiac ten sam blad. Sciezka approve -> fund -> kwit ->
// Firestore siedzi w `useCreateAsk` i tez jest wspolna.
import AskComposer, { type AskDraft } from './components/AskComposer';
import AskCard from './components/AskCard';
import { useCreateAsk } from '../utils/asks/useCreateAsk';
import { loadListedVaults } from '../utils/asks/listedVaults';
import type { Ask } from '../utils/asks/types';
import { HomeIcon, UserIcon, ChartBarIcon } from '@heroicons/react/24/solid';
import { LayoutGrid, UserCircle, Rss, Eye, Users, Compass } from 'lucide-react';
// GlassIcons juz tu nie wchodzi - nawigacja desktopu idzie przez
// SoftSectionList (patrz komentarz przy liscie w kolumnie bocznej).
// Sam komponent zostaje w repo nietkniety.
import GooeyNav from '../components/GooeyNav/GooeyNav';
import SoftFeedMobile from './soft/SoftFeedMobile';
import { NameWithSuffix } from '../utils/nameSuffix';
import { getGlobalStats, likesTotal, likesNote, likesDetail } from '../utils/stats/globalStats';
import Link from 'next/link';
import SoftSectionList from './soft/SoftSectionList';
import SoftTrendsPanel from './soft/SoftTrendsPanel';
import SoftProfileHeader from './soft/SoftProfileHeader';
const MusicSelector = dynamic(() => import('./components/MusicSelector'), { ssr: false });
import SpotifyTrackCard from './components/SpotifyTrackCard';
// Import Zora SDK functions
// Import Viem types
import { Address as ViemAddress } from 'viem';
const CreatePostBaseCamp = dynamic(() => import('./components/BaseCampPosts/CreatePostBaseCamp'), { ssr: false });
import ClaimPortalBanner from './components/BaseCampPosts/ClaimPortalBanner';
const CreatePostLinea = dynamic(() => import('./Linea/components/CreatePostLinea'), { ssr: false });
const CreatePostCelo = dynamic(() => import('./Celo/components/CreatePostCelo'), { ssr: false });
const CreatePostEthereum = dynamic(() => import('./ETH/components/CreatePostEthereum'), { ssr: false });
const CreatePostWorldChain = dynamic(() => import('./World/components/CreatePostWorldChain'), { ssr: false });
const CreatePostRobinhood = dynamic(() => import('./Robinhood/components/CreatePostRobinhood'), { ssr: false });
import MockFeed from './prelogin/MockFeed';
import { BASECAMP_CHAIN_ID } from '../contracts/BaseCampPostContract';
import { LINEA_CHAIN_ID } from './Linea/config/LineaNetworkConfig';
import { CELO_CHAIN_ID } from './Celo/config/CeloNetworkConfig';
import { ETHEREUM_CHAIN_ID } from './ETH/config/EthereumNetworkConfig';
import { WORLD_CHAIN_ID } from './World/config/WorldChainNetworkConfig';
import { ROBINHOOD_CHAIN_ID } from './Robinhood/config/RobinhoodNetworkConfig';

// Add global type declaration for CoinGecko widget
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gecko-coin-price-marquee-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        outlined?: string;
        'coin-ids'?: string;
        'initial-currency'?: string;
      };
    }
  }
}

interface LocalUserProfile {
  avatar?: string;
  name: string;
  bio?: string;
  postCount: number;
  likesReceived: number;
  address?: string;
  socialLinks?: {
    twitter?: string;
    farcaster?: string;
    discord?: string;
  };
}

interface ActiveUser {
  address: string;
  points: number;
  stats: {
    posts: number;
    likes: number;
  };
  lastActive: number;
}

// Usuniete jako martwe: BASESCAN_API_KEY (klucz wpisany na sztywno, ladowal do
// publicznego bundle'a, a zadne zapytanie go nie uzywalo - fetchData skasowano
// wczesniej) oraz `gradientAnimation` (string CSS, ktorego nikt nie wstrzykiwal).

// Zaktualizuj funkcję sprawdzającą czy nazwa to BaseName
const isBaseName = (name: string) => {
  if (!name) return false;
  return name.endsWith('.base.eth') || name.endsWith('.base');
};

// Nowy komponent BanPage
function BanPage({ children }: { children: React.ReactNode }) {
  const { isBanned, reason, bannedAt, isMounted } = useBanStatus();

  if (!isMounted) {
    return <div></div>;
  }

  if (isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <BanMessage reason={reason} bannedAt={bannedAt} />
          <div className="mt-8 text-center text-gray-400">
            Nie masz dostępu do tej strony z powodu blokady konta.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
}

type EthereumAddress = `0x${string}`;

const toEthereumAddress = (address: string): EthereumAddress => {
  if (!address.startsWith('0x')) {
    throw new Error('Invalid Ethereum address format');
  }
  return address as `0x${string}`;
};

// Usuniete jako martwe: komponent BaseNameBadge (nigdzie nierenderowany) oraz
// uploadMetadataJson() - helper strzelajacy do nieistniejacej trasy
// /api/upload-metadata. Metadane Zory wysyla /api/upload w handleCreatePost.

// 🚀 POSTS CACHE FUNCTIONS - localStorage cache z 5-minutowym TTL
const POSTS_CACHE_DURATION = 5 * 60 * 1000; // 5 minut w ms

const getCachedPosts = (cacheKey: string): ExtendedPost[] | null => {
  try {
    const cached = localStorage.getItem(`posts_${cacheKey}`);
    const timestamp = localStorage.getItem(`posts_${cacheKey}_timestamp`);
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp);
      if (age < POSTS_CACHE_DURATION) {
        console.log(`🎯 Posts loaded from cache (${Math.round(age/1000)}s old) - ZERO Firebase reads!`);
        return JSON.parse(cached);
      } else {
        // Cache wygasł, usuń stare dane
        localStorage.removeItem(`posts_${cacheKey}`);
        localStorage.removeItem(`posts_${cacheKey}_timestamp`);
        console.log(`⏰ Posts cache expired (${Math.round(age/1000)}s old) - fetching fresh data`);
      }
    }
  } catch (error) {
    console.error('Error reading posts cache:', error);
  }
  return null;
};

const setCachedPosts = (cacheKey: string, posts: ExtendedPost[]) => {
  try {
    localStorage.setItem(`posts_${cacheKey}`, JSON.stringify(posts));
    localStorage.setItem(`posts_${cacheKey}_timestamp`, Date.now().toString());
    console.log(`💾 Cached ${posts.length} posts for key: ${cacheKey}`);
  } catch (error) {
    console.error('Error saving posts cache:', error);
  }
};

const clearPostsCache = () => {
  try {
    // Usuń wszystkie cache'owane posty
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('posts_')) {
        localStorage.removeItem(key);
      }
    });
    console.log('🗑️ Posts cache cleared');
  } catch (error) {
    console.error('Error clearing posts cache:', error);
  }
};

/**
 * Dopisuje SWIEZO UTWORZONY post na gore kazdej zapisanej listy.
 *
 * PROBLEM, KTORY TO ROZWIAZUJE. Cache postow jest kluczowany per zakladka
 * (`posts_forYou_<adres>`, `posts_all`, ...) i zyje 5 minut. Sciezka publikacji
 * dopisywala post optymistycznie do stanu Reacta, ale NIE do cache'u - wiec po
 * przejsciu na inna zakladke i powrocie widok odtwarzal sie z zapisanej listy
 * SPRZED posta. Uzytkownik widzial wtedy, ze post zniknal. Odwrotnie tez:
 * przelaczenie na zakladke, ktorej cache akurat wygasl, pokazywalo post - stad
 * "musialem przeklikac na swoj feed i wrocic".
 *
 * DLACZEGO DOPISUJEMY, A NIE KASUJEMY. Kasowanie calego cache'u (clearPostsCache)
 * dziala, ale kaze potem pobrac WSZYSTKIE listy od nowa - czyli placimy pelnym
 * przeladowaniem feedu za jeden post, ktorego tresc i tak mamy juz w pamieci.
 * Przy Firestore, ktory liczy za kazdy odczyt dokumentu, to jest czysta strata.
 * Dopisanie kosztuje zero odczytow i daje ten sam efekt.
 *
 * Znacznik czasu cache'u zostaje NIETKNIETY: dopisanie posta nie jest powodem,
 * zeby przedluzyc waznosc reszty listy.
 */
const prependPostToCache = (post: ExtendedPost) => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('posts_') && !key.endsWith('_timestamp'))
      .forEach((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;

        try {
          const cached = JSON.parse(raw);
          if (!Array.isArray(cached)) return;

          // Idempotencja: ta sama funkcja bywa wolana po optymistycznym
          // dopisaniu i ponownie po potwierdzeniu z Firestore.
          if (cached.some((entry: ExtendedPost) => entry?.id === post.id)) return;

          localStorage.setItem(key, JSON.stringify([post, ...cached]));
        } catch {
          // Uszkodzony wpis kasujemy - lepiej pobrac na nowo niz czytac smiec.
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_timestamp`);
        }
      });
  } catch (error) {
    console.error('Error prepending post to cache:', error);
  }
};

/**
 * Nanosi zmiane na JEDEN post we wszystkich zapisanych listach.
 *
 * PO CO. Polubienie zmienia stan w pamieci, ale po przejsciu na inna zakladke
 * i powrocie widok odtwarza sie z localStorage - czyli serduszko wracaloby do
 * poprzedniego stanu, mimo ze zapis w Firestore sie powiodl. Alternatywa
 * byloby skasowanie cache'u i ponowne pobranie CALEJ listy, czyli placenie
 * odczytem calego feedu za jedno klikniecie.
 *
 * Ta funkcja kosztuje ZERO odczytow: post jest juz w pamieci, wiec nanosimy na
 * niego dokladnie te zmiane, ktora zobaczyl uzytkownik.
 *
 * Znacznik waznosci cache'u zostaje nietkniety - polubienie nie jest powodem,
 * zeby przedluzac waznosc reszty listy.
 */
const patchPostInCache = (postId: string, patch: (post: ExtendedPost) => ExtendedPost) => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('posts_') && !key.endsWith('_timestamp'))
      .forEach((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try {
          const cached = JSON.parse(raw);
          if (!Array.isArray(cached)) return;
          if (!cached.some((entry: ExtendedPost) => entry?.id === postId)) return;
          localStorage.setItem(
            key,
            JSON.stringify(
              cached.map((entry: ExtendedPost) => (entry?.id === postId ? patch(entry) : entry))
            )
          );
        } catch {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_timestamp`);
        }
      });
  } catch (error) {
    console.error('Error patching post in cache:', error);
  }
};

/**
 * Podmienia tymczasowe ID posta na prawdziwe, gdy Firestore je odda.
 *
 * Bez tego w cache zostawalby wpis z ID "temp-...", ktory po odswiezeniu
 * strony wygladalby jak istniejacy post, ale kazde klikniecie w niego
 * prowadzilo by do nieistniejacej trasy /post/temp-...
 */
const replacePostIdInCache = (tempId: string, realId: string) => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('posts_') && !key.endsWith('_timestamp'))
      .forEach((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;

        try {
          const cached = JSON.parse(raw);
          if (!Array.isArray(cached)) return;
          if (!cached.some((entry: ExtendedPost) => entry?.id === tempId)) return;

          localStorage.setItem(
            key,
            JSON.stringify(
              cached.map((entry: ExtendedPost) =>
                entry?.id === tempId ? { ...entry, id: realId } : entry
              )
            )
          );
        } catch {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_timestamp`);
        }
      });
  } catch (error) {
    console.error('Error replacing post id in cache:', error);
  }
};

function BaseChatContent() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'left' | 'main' | 'right'>('main');
  const [activeMainPanel, setActiveMainPanel] = useState<'feed' | 'builders' | 'following' | 'friends' | 'discover' | 'notifications'>('feed');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [selectedBuilderProfile, setSelectedBuilderProfile] = useState<{
    address: string;
    name: string;
    avatar?: string;
    bio?: string;
    postCount?: number;
    likesReceived?: number;
    socialLinks?: {
      twitter?: string;
      farcaster?: string;
      discord?: string;
    };
    stats?: {
      transactions: number;
      tokens: number;
      nfts: number;
      contracts: number;
    };
    totalPoints?: number;
    currentRank?: UserRank;
    baseChatPoints?: {
      postPoints?: number;
      likePoints?: number;
      activityBonus?: number;
      baseNameBonus?: number;
      sphereBonus?: number;
      camperBonus?: number;
      celoBonus?: number;
      worldBonus?: number;
      referralPoints?: number;
      totalPoints?: number;
    };
  } | null>(null);
  
  // Network filter state - renamed to activePostingNetwork to reflect its new purpose
  const [activePostingNetwork, setActivePostingNetwork] = useState<'base' | 'basecamp' | 'optimism' | 'ethereum' | 'arbitrum' | 'monad' | 'linea' | 'celo' | 'worldchain' | 'robinhood'>('base');
  
  // Globalne deklaracje stanów modalu przeniesione na początek funkcji
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'error' | 'warning' | 'confirm'>('error');
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [posts, setPosts] = useState<ExtendedPost[]>([]);
  const [newPost, setNewPost] = useState('');
  // Platna czesc posta. Domyslnie wylaczona - wiekszosc postow nie jest platna.
  const [premium, setPremium] = useState<PremiumComposerValue>(EMPTY_PREMIUM);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  /**
   * Platna czesc, ktora NIE zostala zapieczetowana, mimo ze post juz istnieje.
   *
   * Post w tym stanie jest zwyklym, darmowym postem - i tak tez wyglada dla
   * wszystkich, lacznie z autorem. Szkic trzymamy, zeby autor mogl dokonczyc
   * jednym klknieciem zamiast pisac tekst od nowa.
   */
  const [pendingPremium, setPendingPremium] = useState<{
    postId: string;
    draft: PremiumComposerValue;
    /** Czy brakuje wylacznie podpisu - wtedy ponowienie zaczyna od logowania. */
    needsSignIn: boolean;
    /** Zdanie dla autora: co dokladnie sie nie udalo. */
    reason: string;
  } | null>(null);
  const [isRetryingPremium, setIsRetryingPremium] = useState(false);
  /**
   * Publikacja zatrzymana przed powstaniem posta, bo platna czesc wymaga
   * podpisu, a podpisu nie bylo. Trzymane jako STAN, nie jako toast: toast
   * znika po kilku sekundach, a czlowiek zostaje z wypelnionym kompozytorem
   * i bez odpowiedzi na pytanie "dlaczego nic sie nie stalo".
   *
   * Dokladny powod (odmowa w portfelu vs. niedzialajace logowanie serwerowe)
   * zna useSiweAuth, ale dopiero PO przerysowaniu - dlatego tekst skladamy
   * przy renderze, a nie tuz po `await signIn()`.
   */
  const [blockedOnPremiumSignIn, setBlockedOnPremiumSignIn] = useState(false);
  // 🎵 Stany dla funkcjonalności muzyki
  const [selectedMusic, setSelectedMusic] = useState<any>(null);
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  
  // Pending Pin state management
  const [pendingPins, setPendingPins] = useState<{[postId: string]: {
    txHash: string;
    duration: string;
    expectedAt: number;
  }}>({});
  // `newComments` (tresci pol komentarzy) zniknelo razem z handleAddComment -
  // pola komentarzy renderuje i trzyma PostList.
  const [userProfile, setUserProfile] = useState<LocalUserProfile>({
    name: '',
    postCount: 0,
    likesReceived: 0
  });
  const [stats, setStats] = useState<Stats>({
    transactions: 0,
    tokens: 0,
    nfts: 0,
    contracts: 0,
    transactionPoints: 0,
    tokenPoints: 0,
    nftPoints: 0,
    contractPoints: 0
  });
  // fileInputRef / postFileInputRef byly tworzone, ale nie podpiete do zadnego
  // <input> - wybor pliku idzie przez document.getElementById('fileInput').
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  /**
   * Sesja SIWE - potrzebna WYLACZNIE do platnej czesci posta. Zwykly post nie
   * wymaga tu niczego i nie ma prawa niczego wymagac.
   *
   * `siweAddressRef`, bo o sesje pytamy w srodku funkcji asynchronicznych,
   * ktore moga przezyc kilka renderow - odczyt ze zmiennej z domkniecia
   * pokazalby stan sprzed podpisu.
   */
  const { address: siweAddress, signIn: siweSignIn, error: siweError } = useSiweAuth();
  const siweAddressRef = useRef<string | null>(siweAddress);
  siweAddressRef.current = siweAddress;
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [postPreviewImage, setPostPreviewImage] = useState<string | null>(null);
  const [postPreviewVideo, setPostPreviewVideo] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  /**
   * Liczniki startuja z `null`, nie z liczba.
   *
   * Byly tu wartosci poczatkowe 175708 / 18817 / 239961 / 10972 - czyli
   * wymyslone liczby POKAZYWANE, zanim cokolwiek sie wczytalo. Przy pustym
   * odczycie zostawaly na ekranie i nikt nie mial jak odroznic "policzone" od
   * "wpisane". `null` renderuje sie jako kreska i takiej pomylki nie da sie
   * zrobic.
   */
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalLikes, setTotalLikes] = useState<number | null>(null);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [totalComments, setTotalComments] = useState<number | null>(null);
  const [totalTips, setTotalTips] = useState<number | null>(null);
  /**
   * Zastrzezenie pod liczba lajkow, np. "at least" albo "since Aug 6" - albo
   * `undefined`, gdy liczba jest calkowita.
   *
   * Lajki nie maja wlasnej kolekcji i nie da sie ich zsumowac agregacja, wiec
   * dopoki nikt nie policzyl stanu poczatkowego serwerowo, mamy tylko przyrost
   * od wlaczenia licznika. Ta linijka jest cena za pokazanie takiej liczby -
   * bez niej czesc sumy udaje calosc.
   */
  const [likesNoteText, setLikesNoteText] = useState<string | undefined>(undefined);
  /**
   * To samo zastrzezenie, ale calym zdaniem - idzie do dymka nad liczba.
   *
   * Osobny stan od `likesNoteText`, bo krotki podpis ma sie zmiescic w kaflu
   * o polowie szerokosci panelu, a powod, dla ktorego liczba jest niepelna,
   * w dwa slowa sie nie miesci. Oba zdania buduje globalStats.ts - tylko ono
   * wie, ktorego rodzaju jest ta niepelnosc.
   */
  const [likesDetailText, setLikesDetailText] = useState<string | undefined>(undefined);
  /** Kiedy policzono liczby wyzej. 0 = nie wiadomo. */
  const [statsMeasuredAt, setStatsMeasuredAt] = useState<number>(0);
  const [expandedUsersList, setExpandedUsersList] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [customName, setCustomName] = useState('');
  const [selectedSuffix, setSelectedSuffix] = useState<'sphere' | 'camper' | 'celo' | 'world'>('sphere');
  const [userNames, setUserNames] = useState<{[key: string]: {name: string, avatar?: string}}>({});
  // Stany edycji posta i komentarza, tresci odpowiedzi, rozwinietych komentarzy,
  // `showOnlyUserPosts` oraz `searchTerm` obslugiwaly wylacznie skasowane wyzej
  // handlery. Zaden z nich nie byl czytany w renderze tej strony - komentarze,
  // edycja i wyszukiwanie maja wlasne stany w PostList.
  const [selectedTag, setSelectedTag] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedAuthor, setSelectedAuthor] = useState('');


  const [isAppleDevice, setIsAppleDevice] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
    const [showPostImagePreview, setShowPostImagePreview] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showMyFeed, setShowMyFeed] = useState(false);
  const [activeFeed, setActiveFeed] = useState<'forYou' | 'following' | 'baseName'>('forYou'); // Dodajemy 'baseName'
  /**
   * Filtr sieci dla paska "stories" na telefonie. `null` = wszystkie lancuchy
   * i taki jest stan poczatkowy: gdyby domyslnie wybrany byl Base, feed po
   * wejsciu ukrywalby posty z siedmiu pozostalych sieci bez informacji dlaczego.
   */
  const [mobileNetwork, setMobileNetwork] = useState<string | null>(null);

  /**
   * Lista podawana do PostList, przefiltrowana o wybrana siec.
   *
   * === DLACZEGO useMemo, A NIE FILTR W MIEJSCU UZYCIA ===
   * Stalo to inline w propsach: `mobileNetwork ? posts.filter(...) : posts`.
   * Przy WLACZONYM filtrze `.filter()` tworzy NOWA TABLICE przy kazdym
   * renderze rodzica - nawet gdy ani `posts`, ani `mobileNetwork` sie nie
   * zmienily. PostList jest opakowany w React.memo wlasnie po to, zeby feed
   * nie przerysowywal sie przy kazdym nacisnieciu klawisza w kompozytorze,
   * a nowa tozsamosc tablicy przebijala to memo za kazdym razem.
   *
   * Gorszy skutek byl widoczny golym okiem: PostList synchronizuje swoj stan
   * wewnetrzny z tym propsem, wiec swieza tablica KASOWALA optymistyczna
   * zmiane. Na telefonie z wybrana siecia serduszko potrafilo wrocic do
   * poprzedniego stanu MIMO udanego zapisu do Firestore - wygladalo jak
   * nieudany lajk, a zapis byl w porzadku.
   *
   * Na desktopie `mobileNetwork` jest zawsze `null`, wiec przechodzi tu ta
   * sama referencja `posts` co dotad - zero zmiany zachowania.
   */
  const visiblePosts = useMemo(
    () =>
      mobileNetwork
        ? posts.filter((p) => (p.network ?? 'base') === mobileNetwork)
        : posts,
    [posts, mobileNetwork]
  );

  /**
   * Adresy, ktore ten uzytkownik OBSERWUJE.
   *
   * === CO BYLO ===
   * Zakladka "Follows" przekazywala do fetchPosts `authorFilter: address`,
   * czyli WLASNY adres - i pokazywala wlasne posty. Komentarz przy drugim
   * wywolaniu sam sie do tego przyznawal ("Pobierz tylko posty uzytkownika").
   * Etykieta mowila "Follows", tresc byla "moje", a caly graf obserwowanych
   * nie mial na feed zadnego wplywu.
   *
   * `null` znaczy "jeszcze nie wiem", pusta tablica - "nikogo nie obserwuje".
   * To dwa rozne stany i feed ma je rozroznic: przy `null` nie ma sensu
   * pytac o posty, bo nie wiadomo czyje.
   */
  const [followingIds, setFollowingIds] = useState<string[] | null>(null);

  // Lista obserwowanych wczytywana TYLKO wtedy, gdy zakladka jej potrzebuje.
  // Bezwarunkowe pobieranie kosztowaloby odczyt u kazdego, kto nigdy nie
  // zajrzy do "Follows".
  useEffect(() => {
    if (activeFeed !== 'following' || !address) return;
    let anulowane = false;

    (async () => {
      try {
        const { fetchFollowingIdSet } = await import('../utils/friends/follows');
        const zbior = await fetchFollowingIdSet(address);
        if (!anulowane) setFollowingIds(Array.from(zbior));
      } catch (blad) {
        console.error('[feed] Nie udalo sie wczytac obserwowanych:', blad);
        // NIE ustawiamy pustej tablicy: pusta znaczy "nikogo nie obserwuje",
        // a to zupelnie inne zdanie niz "nie udalo sie sprawdzic".
        if (!anulowane) setFollowingIds(null);
      }
    })();

    return () => {
      anulowane = true;
    };
  }, [activeFeed, address]);

  /**
   * Czy na TELEFONIE rozwiniety jest kompozytor.
   *
   * Wczesniej telefon pokazywal naraz: pasek sieci na gorze, zwinieta pigulke
   * "What's happening onchain?" z plusem, PONIZEJ drugi wybor sieci i PONIZEJ
   * pelny kompozytor z tym samym napisem. Czyli dwa pytania "co slychac?" i
   * dwa rzedy logotypow sieci na jednym ekranie, zanim pojawil sie pierwszy
   * post.
   *
   * Te dwa wybory sieci NIE sa tym samym: pasek na gorze filtruje feed, a ten
   * pod spodem decyduje, na ktory lancuch POLECI POST. Wygladaly jednak
   * identycznie, wiec czytaly sie jak pomylka. Wybor lancucha docelowego
   * nalezy do kompozytora i teraz jest w srodku - widoczny dopiero wtedy, gdy
   * ktos faktycznie pisze.
   *
   * Rozwijamy TEN SAM, JEDYNY kompozytor - nie budujemy drugiego. Drugi
   * formularz pisania postu bylby drugim miejscem, w ktorym trzeba naprawiac
   * ten sam blad, a ten obsluguje siedem lancuchow, tresc premium, PostCoin,
   * zalaczniki i muzyke.
   *
   * Na DESKTOPIE bez zmian - tam nie ma pigulki i kompozytor stoi otwarty.
   */
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);

  /**
   * ===================================================================
   * CO WLASNIE PISZESZ: POST CZY ASK
   * ===================================================================
   * Zgloszenie: "panel na glownym feedzie powinien miec przycisk do
   * przelaczania pomiedzy Post i Postcoin czyli to co teraz jest a ASK".
   *
   * === DLACZEGO DWIE PIGULKI, A NIE TRZY ===
   * Kusi ulozyc to jako "Post / PostCoin / Ask", ale wybor miedzy Postem
   * a PostCoinem NIE JEST DZIS TRYBEM i nie wolno go w tryb zamienic.
   * To sa DWA PRZYCISKI WYSYLKI pod jednym szkicem: piszesz raz, a na koncu
   * decydujesz, czy to leci jako zwykly post (TransactionButton), czy jako
   * PostCoin. Trzecia pigulka wymusilaby te decyzje PRZED napisaniem
   * czegokolwiek i zabralaby mozliwosc zmiany zdania na koncu - czyli
   * zepsulaby dzialajacy uklad, zeby doloczyc do niego czwarta rzecz.
   *
   * Ask stoi na innej osi: to inny PRZEDMIOT (pytanie z budzetem, miejscami
   * i terminem), a nie inny sposob wyslania posta. Dlatego przelacznik ma
   * dwa stany - "co robisz" - a wewnatrz trybu Post zostaje nietkniety wybor
   * "jak to wysylasz". Przy okazji: dwie pigulki miesza sie na 360px obok
   * istniejacych ikon, trzy juz nie.
   *
   * Domyslnie 'post'. `AskComposer` jest ciezki (budzet, miejsca, termin,
   * escrow), wiec dopoki nikt go nie wybral, NIE JEST W OGOLE MONTOWANY -
   * tak samo jak platna sekcja, ktora czeka zwinieta.
   */
  const [composerMode, setComposerMode] = useState<'post' | 'ask'>('post');

  /**
   * Aski zalozone W TEJ SESJI, z tego urzadzenia.
   *
   * Sa OSOBNO od pasa `FeedAskRail`, bo pas ma wlasny cache i wlasny odczyt,
   * a ten, kto wlasnie zablokowal budzet, musi zobaczyc kwit NATYCHMIAST -
   * nie za piec minut i nie po przejsciu na /asks. Ta lista niczego nie
   * dociaga: kazde pole pochodzi z tego, co poszlo do zapisu.
   */
  const [asksCreatedHere, setAsksCreatedHere] = useState<Ask[]>([]);

  /**
   * Cala sciezka pieniedzy Aska: approve -> fund -> kwit -> dopiero Firestore.
   * Kolejnosc i komunikaty stoja w `app/utils/asks/useCreateAsk.ts`.
   */
  const askFlow = useCreateAsk();

  /**
   * Ask zalozony z feedu.
   *
   * Rzucony blad wraca do `AskComposer`, ktory pokazuje go nad przyciskiem i
   * NIE czysci formularza - dlatego tutaj nie ma zadnego catch. Czyszczenie
   * pol robi kompozytor sam, dopiero po udanym zapisie.
   */
  const handleCreateAskFromFeed = useCallback(
    async (draft: AskDraft) => {
      const created = await askFlow.submit(draft);
      setAsksCreatedHere((previous) => [created, ...previous]);

      /**
       * ===== PAS NAD FEEDEM MA SIE DOWIEDZIEC, ZE COS DOSZLO =====
       * `FeedAskRail` trzyma odpowiedz w localStorage na piec minut. Bez
       * uniewaznienia wpisu autor po zalozeniu Aska widzialby nad feedem
       * liste SPRZED wlasnego Aska - i to przez caly ten czas wygladaloby
       * jak nieudany zapis.
       *
       * Czyscimy WPIS, a nie przerysowujemy pasa. Wymuszony ponowny odczyt
       * (remount przez `key`) kosztowalby dodatkowe zapytanie natychmiast po
       * zapisie, pokazalby tego samego Aska DWA RAZY - raz w pasie, raz w
       * kwicie ponizej - a przy nieudanym odczycie zamienilby potwierdzenie
       * sukcesu w komunikat awarii. Pas i tak pobierze swieza liste przy
       * najblizszym wejsciu na feed.
       *
       * Klucz jest IMPORTOWANY, nie przepisany. Przez chwile stal tu literal
       * skopiowany z `FeedAskRail.tsx` - dwie kopie jednego napisu, ktore
       * rozjezdzaja sie przy pierwszej zmianie nazwy, a rozjazd nie wywala
       * buildu: uniewaznienie po prostu przestaje trafiac w cache i autor
       * znowu widzi liste sprzed wlasnego Aska. Cichy blad, ktory wroci jako
       * "zalozylem Aska i go nie ma".
       *
       * Znacznik czasu chodzi za kluczem (`${key}_timestamp`) - ta konwencja
       * nalezy do pasa i jest w nim zapisana w readCachedAsks/writeCachedAsks.
       *
       * Uniewazniamy WYLACZNIE otwarte. Historia (`_resolved`) ma osobny wpis
       * i zalozenie nowego Aska jej nie zmienia, wiec nie ma powodu kasowac
       * odpowiedzi, za ktora ktos juz zaplacil odczytem.
       */
      try {
        localStorage.removeItem(ASKS_RAIL_CACHE_KEY);
        localStorage.removeItem(`${ASKS_RAIL_CACHE_KEY}_timestamp`);
      } catch (error) {
        // Brak dostepu do localStorage nie moze przewrocic zalozonego Aska -
        // on juz istnieje, a to jest tylko sprzatanie cache'u.
        console.error('[asks] Uniewaznienie cache pasa Askow nie powiodlo sie:', error);
      }
    },
    // Sam `submit` jest stabilny miedzy renderami, a caly `askFlow` nie -
    // to nowy obiekt przy kazdym przerysowaniu feedu, czyli useCallback bez
    // zadnego efektu.
    [askFlow.submit]
  );

  // Hook do sprawdzania BaseName
  const { data: baseName } = useName(
    { address: (address || '0x0000000000000000000000000000000000000000') as `0x${string}`, chain: base },
    { enabled: Boolean(address) }
  );

  // Funkcja sprawdzająca czy użytkownik może tworzyć posty - dostępne dla wszystkich
  const canCreatePosts = true; // Zmieniono z Boolean(baseName) na true, aby wszyscy mogli tworzyć posty

  // Dodaj nowy stan dla tooltipa
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);

  // useSocial() bylo tu wolane, ale wynik nie byl czytany ani razu. Hook przy
  // kazdym wejsciu na strone robil siedem zapytan do Firestore (followers 50,
  // following 50, friends 50, notifications 20 + trzy statystyki) i zakladal
  // subskrypcje czasu rzeczywistego. Widoki, ktore tych danych faktycznie
  // uzywaja - FollowingView, FriendsView, DiscoverView, NotificationsView,
  // BuilderProfile - wolaja useSocial samodzielnie i sa ladowane leniwie.

  // URL params for navigation (Parametry URL do nawigacji)
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlView = searchParams.get('view');
  const welcomeParam = searchParams.get('welcome');
  /**
   * Tresc wstawiona z zewnatrz - dzis wylacznie z sekcji B20 ("Share to feed"
   * na stronie tokena i po jego utworzeniu).
   *
   * DLACZEGO PRZEZ ADRES, A NIE PRZEZ STAN: te dwie strony sa SERWEROWE
   * i nie dziela stanu z feedem. Adres jest jedynym kanalem, ktory laczy
   * dwie osobne trasy bez wciagania globalnego magazynu dla jednej rzeczy.
   */
  const shareParam = searchParams.get('share');
  const [userStats, setUserStats] = useState<{[key: string]: Stats & { totalPoints: number }}>({});
  // `hoveredElement` bylo ustawiane przy kazdym najechaniu na nazwe uzytkownika w
  // feedzie, ale nikt tej wartosci nie czytal - podpowiedz "Click to view profile"
  // robi CSS (group-hover). Efektem byl pelny re-render tej ~4000-liniowej strony
  // na kazde wejscie i zejscie kursora z dowolnego nicku. Stan usuniety.
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);

  const chainId = useChainId();
  
  /**
   * ===== TOKEN WRZUCONY NA FEED Z SEKCJI B20 =====
   *
   * Ktos tworzy token na /b20/create albo oglada go na /b20/[adres] i chce
   * o nim powiedziec. Dotad musialby przepisac adres recznie - a adres B20 ma
   * czterdziesci znakow i nikt tego nie robi. Przycisk "Share to feed" przynosi
   * gotowa tresc tutaj.
   *
   * TRESC JEST SZKICEM, NIE WPISEM: ladue do pola, ktore czlowiek widzi i moze
   * zmienic, a nie do gotowego posta. Nic nie zostaje wyslane bez jego reki.
   *
   * Nadpisujemy TYLKO puste pole. Kto zaczal juz cos pisac i trafil tu z linkiem,
   * nie ma prawa stracic swojego tekstu - to ta sama zasada, ktora rzadzi
   * zaczatkami Askow (znikaja, gdy tylko ktos zacznie pisac).
   *
   * Parametr znika z adresu po zuzyciu (`replace`, nie `push`), inaczej
   * odswiezenie strony wstawialoby ten sam szkic drugi raz, a przycisk "wstecz"
   * wracalby do stanu, ktorego juz nie ma.
   */
  const shareUsedRef = useRef(false);
  useEffect(() => {
    if (!shareParam || shareUsedRef.current) return;
    shareUsedRef.current = true;

    // Format: "SYMBOL|Nazwa|0xadres". Rozbijamy recznie, bo nazwa moze zawierac
    // spacje i przecinki, a kreska pionowa w nazwie tokena sie nie zdarza.
    const parts = shareParam.split('|');
    const symbol = (parts[0] || '').trim();
    const name = (parts[1] || '').trim();
    const tokenAddress = (parts[2] || '').trim();

    if (/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
      const label = symbol ? `$${symbol}` : 'this token';
      const title = name && symbol ? `${name} (${label})` : label;
      setNewPost((current) =>
        current.trim() === ''
          ? `${title} is live on Base.\n\nmysphere.fun/b20/${tokenAddress.toLowerCase()}`
          : current
      );
      setMobileComposerOpen(true);
    }

    router.replace('/basechat', { scroll: false });
  }, [shareParam, router]);

  // Obsługa komunikatu powitalnego dla użytkowników z linku referalowego
  useEffect(() => {
    if (welcomeParam === 'true' && address) {
      setShowWelcomeMessage(true);
      // Usuń parametr z URL po wyświetleniu
      setTimeout(() => {
        router.replace('/basechat', { scroll: false });
      }, 100);
      // Ukryj komunikat po 5 sekundach
      setTimeout(() => {
        setShowWelcomeMessage(false);
      }, 5000);
    }
  }, [welcomeParam, address, router]);

  // Function to clear URL params (Funkcja do czyszczenia parametrów URL)
  const clearViewParams = () => {
    router.replace('/basechat', { scroll: false });
  };

  // Funkcja do pobierania statystyk użytkownika
  const fetchUserStats = async (userAddress: string) => {
    if (!userStats[userAddress]) {
      try {
        const userRef = doc(db, 'users', userAddress);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
        
        if (userData?.stats) {
          setUserStats(prev => ({
            ...prev,
            [userAddress]: {
              ...userData.stats,
              totalPoints: userData.totalPoints || 0
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
      }
    }
  };

  // Funkcja pomocnicza do wyświetlania nazwy użytkownika z tooltipem
  const displayUserName = useCallback((userAddress: string, elementId: string, showAvatar: boolean = false) => {
    // Sprawdź, czy mamy już nazwę w cache
    const userName = userNames[userAddress]?.name || userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
    const hasBaseName = isBaseName(userName);
    
    return (
      <div className="relative inline-block">
        <div className="flex items-center">
          {showAvatar && (
            userNames[userAddress]?.avatar ? (
              <img
                src={userNames[userAddress].avatar}
                alt="Profile"
                className="w-10 h-10 rounded-full mr-2"
              />
            ) : (
              <Avatar address={toEthereumAddress(userAddress)} className="w-10 h-10 rounded-full mr-2" />
            )
          )}
          {/* Klikalny div, a nie <button>, bo w srodku siedzi pozycjonowana
              podpowiedz - <div> w <button> to niepoprawne zagniezdzenie. Stad
              rola, focus z klawiatury i obsluga Enter/Spacji, zeby profil dalo
              sie otworzyc bez myszy. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`View profile of ${userName}`}
            className="cursor-pointer group relative"
            onClick={() => handleViewBuilderProfile(userAddress)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleViewBuilderProfile(userAddress);
              }
            }}
          >
            <span className={`${hasBaseName ? 'username-gradient' : 'text-gray-900 dark:text-white'} text-base`}>
              {/* Koncowka trzyma kolor swojej sieci. Bylo tu piec galezi
                  `endsWith(...)` z kolorami wpisanymi recznie - w tym
                  `!text-yellow-500` dla `.celo`, czyli zolty na bialym,
                  praktycznie nieczytelny. Lista koncowek zyje teraz w
                  app/utils/nameSuffix.tsx, wiec Trends i to miejsce nie
                  moga sie juz rozjechac. */}
              <NameWithSuffix name={userName} className="text-gray-900 dark:text-white" />
            </span>
            {/* Base logo removed as requested */}
            {/* Podpowiedź nad nazwą zamiast pod nią */}
            <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-[9px] text-blue-400 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
              Click to view profile
            </div>
          </div>
        </div>
      </div>
    );
  }, [userNames]); // Usunięto handleViewBuilderProfile z zależności bo jest zdefiniowana później

  // Funkcja do zapisywania własnej nazwy
  const handleSaveCustomName = async () => {
    if (!address || !customName.trim()) return;
    
    try {
      // Dodaj wybraną końcówkę do nazwy
      const newName = customName.trim() + '.' + selectedSuffix;
      const success = await saveProfileName(address, newName, selectedSuffix);
      
      if (success) {
        // Aktualizuj lokalny stan
        setUserNames(prev => ({
          ...prev,
          [address]: { name: newName, avatar: undefined }
        }));
        
        // Aktualizuj profil użytkownika
        setUserProfile(prev => ({
          ...prev,
          name: newName,
          address: address
        }));
        
        // Zapisz pełny profil do Firebase
        await saveUserProfile({
          walletAddress: address,
          name: newName
        });
        
        // Wyczyść formularz
        setCustomName('');
        setSelectedSuffix('sphere' as 'sphere' | 'camper' | 'celo' | 'world');
        
        // Wyczyść cache nazw użytkowników dla tego adresu i odśwież
        clearUserNamesCache();
        // Odśwież nazwy użytkowników dla wszystkich postów
        if (posts.length > 0) {
          await fetchUserNames(posts);
        }
        
        // Jeśli użytkownik ma otwarty swój profil, odśwież go
        if (selectedBuilderProfile && selectedBuilderProfile.address === address) {
          // Poczekaj chwilę, żeby Firebase zdążył zapisać dane (w tym bonusy)
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Odśwież profil po zapisaniu nazwy (punkty mogą się zmienić)
          await handleViewBuilderProfile(address);
        }
        
        // Pokaż komunikat o bonusie punktów za wybraną domenę
        if (selectedSuffix === 'sphere') {
          alert('🎉 You earned 1500 bonus points for picking .sphere!');
        } else if (selectedSuffix === 'camper') {
          alert('🎉 You earned 1000 bonus points for picking .camper!');
        } else if (selectedSuffix === 'celo') {
          alert('🎉 You earned 1250 bonus points for picking .celo!');
        } else if (selectedSuffix === 'world') {
          alert('🎉 You earned 1250 bonus points for picking .world!');
        }
      } else {
        toast.error('Could not save your name. Try again.');
      }
    } catch (error) {
      console.error('Error saving custom name:', error);
      toast.error('Could not save your name. Try again.');
    }
  };

  // Funkcja do obsługi zdjęcia w poście
  const handlePostFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    
    if (file.type.startsWith('image/')) {
      reader.onloadend = () => {
        setPostPreviewImage(reader.result as string);
        setPostPreviewVideo(null);
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      reader.onloadend = () => {
        setPostPreviewVideo(reader.result as string);
        setPostPreviewImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Dodaj nowy stan isLoadingPosts do głównego komponentu, niedaleko innych deklaracji stanów
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);

  /**
   * ODCZYT PADL to NIE jest to samo, co "nie ma postow".
   *
   * Dotad `catch` konczyl sie na console.error: stan zostawal pusty,
   * `isLoadingPosts` schodzilo do false i PostList pokazywal "No posts found".
   * Awaria Firestore wygladala wiec dokladnie tak samo jak pusty feed - a to
   * dwa rozne zdania i dwie rozne reakcje po drugiej stronie ekranu.
   */
  const [postsError, setPostsError] = useState<string | null>(null);
  // Podbicie licznika odpala efekt ponizej jeszcze raz - to cale "Try again".
  const [feedReloadNonce, setFeedReloadNonce] = useState(0);

  // Zmodyfikuj useEffect, który pobiera posty, aby obsługiwał stan ładowania
  useEffect(() => {
    // CZYTANIE JEST DARMOWE.
    //
    // Stalo tu `if (!isConnected || !address) return;`, wiec niezalogowany
    // gosc nie pobieral ANI JEDNEGO posta. Ta bramka niczego nie chronila:
    // te same posty sa jawne pod /post/[id] i /u/[address] - komponenty
    // serwerowe, publiczne, w sitemapie. Chowalismy przed gosciem tresc,
    // ktora sami publikujemy gdzie indziej, i placilismy za to wyjsciem
    // kazdego, kto trafil tu z linku.
    //
    // ZAPIS SIE NIE ZMIENIA: kompozytor stoi dalej za `isConnected`, a lajki,
    // komentarze, tipy i przypinanie maja wlasne bramki w PostList.

    // Straznik wyscigu: przelaczenie zakladki feedu albo zmiana portfela w trakcie
    // pobierania konczyla sie tym, ze wolniejsza, JUZ NIEAKTUALNA odpowiedz
    // wpisywala sie do stanu po tej wlasciwej - feed pokazywal posty z poprzednio
    // wybranej zakladki.
    let cancelled = false;

    const loadPosts = async () => {
      try {
        setIsLoadingPosts(true);
        setPostsError(null);

        // Gosc ma WLASNY klucz cache'u zamiast `..._undefined`. Sama mechanika
        // cache'u (TTL, zapis, czyszczenie) zostaje nietknieta - zmienia sie
        // tylko to, jak powstaje klucz.
        const cacheKey = `${activeFeed}_${address ?? 'guest'}`;

        const cachedPosts = getCachedPosts(cacheKey);
        if (cachedPosts) {
          if (!cancelled) {
            setPosts(cachedPosts);
            setIsLoadingPosts(false);
          }
          return;
        }

        let fetchedResult;
        if (activeFeed === 'baseName') {
          fetchedResult = await fetchBaseNameFeedPosts({});
        } else {
          fetchedResult = await fetchPosts({
            userId: address,
            // Posty OBSERWOWANYCH, nie wlasne. `followingIds` null znaczy
            // "jeszcze nie wiem" - wtedy nie zawezamy niczym, zamiast
            // pokazywac cudzy albo wlasny feed pod ta etykieta.
            ...(activeFeed === 'following' && followingIds?.length
              ? { authorsIn: followingIds }
              : {})
          });
        }

        if (cancelled) return;

        setCachedPosts(cacheKey, fetchedResult.posts);
        setPosts(fetchedResult.posts);

      } catch (error) {
        console.error('Error fetching posts:', error);
        if (!cancelled) {
          // Zapisujemy fakt awarii, zeby nizej nie udawac pustego feedu.
          setPostsError('feed-read-failed');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPosts(false);
        }
      }
    };

    loadPosts();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, activeFeed, feedReloadNonce]);

  // Handle URL params for navigation (Obsługa parametrów URL do nawigacji)
  useEffect(() => {
    if (urlView === 'notifications') {
      setActiveMainPanel('notifications');
    }
  }, [urlView]);



  // Update onRefreshPosts to not use network filtering
  const onRefreshPosts = useCallback(async (newPosts?: ExtendedPost[]) => {
    if (!address) return;
    
    try {
      setIsLoadingPosts(true);
      
      if (newPosts && newPosts.length > 0) {
        // Przypadek 1: Otrzymaliśmy nowe posty z infinite scroll
        // lub zoptymalizowane posty z funkcji handleToggleLike
        
        setPosts(currentPosts => {
          // Sprawdź, czy posty mają takie same ID jak istniejące (optymistyczny update)
          // lub są to nowe posty (infinite scroll)
          const existingIds = new Set(currentPosts.map(p => p.id));
          const hasExistingIds = newPosts.some(p => existingIds.has(p.id));
          
          const wynik = hasExistingIds
            // To jest optymistyczny update - całkowicie zastąp posty
            ? newPosts
            // To są nowe posty z infinite scroll - dodaj je do istniejących
            : [...currentPosts, ...newPosts.filter(p => !existingIds.has(p.id))];

          /**
           * ZAPIS DO CACHE'U - BEZ TEGO KOMENTARZ ZNIKAL PO ODSWIEZENIU.
           *
           * === OBJAW ===
           * "na feedzie lajki i komentarze nie zapisuja sie jak odswieze
           * strone albo przejde gdzies indziej, odswiezaja sie odrazu jak
           * przejde na my feed".
           *
           * === PRZYCZYNA ===
           * Ta galaz aktualizowala WYLACZNIE stan Reacta. Do localStorage
           * pisaly tylko sciezki pobierajace z Firestore (`setCachedPosts`
           * po `fetchPosts`). Czyli: dodajesz komentarz, widzisz go, bo stan
           * sie zmienil - odswiezasz strone, a `getCachedPosts` oddaje wpis
           * SPRZED komentarza i komentarz "znika".
           *
           * Dane w Firestore byly przez caly czas poprawne - dlatego wejscie
           * w "My Feed" pokazywalo je natychmiast: tamten widok ma inny klucz
           * cache'a, wiec trafial w pustke i szedl po swieze dane.
           *
           * === DLACZEGO TU, A NIE W KAZDYM HANDLERZE ===
           * Lajki laty juz `patchPostInCache`, ale komentarze, edycje i
           * kasowanie ida wlasnie tedy. Zapis w JEDNYM miejscu obejmuje kazda
           * optymistyczna zmiane naraz - i kazda przyszla, ktora ktos tu doda,
           * nie pamietajac o cache'u.
           *
           * Piszemy tylko przy optymistycznym update (`hasExistingIds`).
           * Doklejanie stron z infinite scrolla do cache'u rozdymaloby go
           * bez granicy - a te posty i tak przyjda z Firestore przy nastepnym
           * wejsciu.
           */
          if (hasExistingIds) {
            setCachedPosts(`${activeFeed}_${address ?? 'guest'}`, wynik);
          }

          return wynik;
        });
      } else {
        // ✅ OPTYMALIZACJA: Przypadek 2 - tylko gdy rzeczywiście potrzebujemy odświeżenia
        // Większość wywołań będzie używać optimistic update (newPosts)
        
        // 🎯 Unikalna kombinacja dla cache'a (adres + tryb)
        // Ten sam ksztalt klucza co przy wczytywaniu (linia ~852). Bylo tu
        // `${address}` bez zapasowej wartosci, wiec bez portfela wychodzil
        // klucz `forYou_undefined`, podczas gdy wczytywanie pisalo do
        // `forYou_guest`. Dwa klucze na te sama liste znaczyly, ze odswiezenie
        // nigdy nie trafialo w to, co przed chwila zapisano.
        const cacheKey = `${activeFeed}_${address ?? 'guest'}`;
        
        // 🚀 Sprawdź cache najpierw
        const cachedPosts = getCachedPosts(cacheKey);
        if (cachedPosts) {
          console.log(`🎯 Refresh using cached posts - ZERO Firebase reads!`);
          setPosts(cachedPosts);
        } else {
          // 💰 Pobierz z Firebase tylko gdy brak cache'a lub wygasł
          console.log(`🔥 Refresh fetching fresh posts from Firebase for: ${cacheKey}`);
        const { posts: refreshedPosts } = await fetchPosts({ 
            userId: address,
            ...(activeFeed === 'following' && followingIds?.length
              ? { authorsIn: followingIds }
              : {})
        });
          
          // 💾 Zapisz do cache'a dla przyszłych użyć
          setCachedPosts(cacheKey, refreshedPosts);
        setPosts(refreshedPosts);
        }
      }
    } catch (error) {
      console.error('Error refreshing posts:', error);
    } finally {
      setIsLoadingPosts(false);
    }
  }, [address, activeFeed]); // Dodano showMyFeed do dependencies

  // Flaga blokujaca wielokrotne tworzenie postow
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  // ---------------------------------------------------------------------------
  // Wspolne czesci sciezki tworzenia posta.
  //
  // Ponizsze cztery pomocnicze funkcje byly wczesniej wklejone osobno w kazdym
  // z trzech handlerow tworzacych post (onchain, Zora, awaryjny zwykly post),
  // a czesc premium az szesc razy. Roznice miedzy kopiami byly przypadkowe -
  // np. sciezka awaryjna gubila zdjecie. Jedno zrodlo prawdy sprawia, ze
  // dolozenie kolejnego wariantu nie oznacza kolejnej kopii.
  // ---------------------------------------------------------------------------

  /**
   * === PLATNA TRESC NIE IDZIE JUZ DO DOKUMENTU POSTA ===
   *
   * Ta funkcja zwracala `premiumContent` razem z cena, a wynik trafial prosto
   * do `createPost`. Kolekcja `posts` jest CZYTELNA DLA WSZYSTKICH, wiec
   * platna tresc lezala tam otwartym tekstem - wystarczylo otworzyc konsole
   * przegladarki, zeby przeczytac ja bez placenia. Paywall byl zaslona na
   * danych, ktore i tak sa jawne.
   *
   * Trasa, ktora robi to poprawnie, ISTNIALA PRZEZ CALY CZAS i nie miala ANI
   * JEDNEGO WYWOLANIA: POST /api/premium zapisuje tresc do kolekcji
   * `premiumContent` (reguly: `allow read, write: if false`, czyli klient nie
   * ma tam wstepu wcale), a dopiero potem oznacza post jako platny i KASUJE
   * jawne pole z dokumentu.
   *
   * Dlatego tutaj nie zostaje nic. Znacznik `hasPremium` i cene ustawia
   * serwer - PO udanym zapisie tresci. Odwrotna kolejnosc dawalaby paywall
   * nad pustka: cena jest, tresci nie ma.
   *
   * Zostawiam funkcje zamiast usuwac jej wywolania: trzy sciezki tworzenia
   * posta rozjechalyby sie przy nastepnej zmianie, a tak dalej maja jeden
   * wspolny punkt.
   */
  const buildPremiumWriteFields = () => ({});

  /**
   * Kopia platnej czesci na czas publikacji - albo `null`, gdy autor jej nie
   * wypelnil.
   *
   * Snapshot, a nie odczyt `premium` w kazdym miejscu: pieczetowanie dzieje sie
   * po transakcji i po zapisie do Firestore, czyli dlugo po tym, jak
   * `resetComposer()` wyczyscil pole. Szkic ma przezyc te droge w calosci,
   * takze na potrzeby ponowienia.
   */
  const takePremiumDraft = (): PremiumComposerValue | null =>
    isPremiumOpen && premium.premiumContent.trim().length > 0
      ? { ...premium, premiumContent: premium.premiumContent.trim() }
      : null;

  /**
   * PODPIS PRZED PUBLIKACJA, NIE PO.
   *
   * === CO BYLO ZLE ===
   * O braku sesji autor dowiadywal sie dopiero z nieudanego pieczetowania,
   * czyli PO tym, jak post juz istnial (a na sciezce onchain - po zaplaceniu
   * za transakcje). Zostawal wtedy z wpisem, ktory wygladal na platny
   * wylacznie jemu, bo znacznik `hasPremium` istnial tylko w stanie Reacta.
   *
   * Teraz o podpis prosimy, dopoki nic jeszcze nie powstalo: odmowa nie
   * zostawia po sobie zadnego sladu, a szkic czeka w kompozytorze.
   *
   * Post BEZ platnej czesci nie przechodzi tedy w ogole - zwykle pisanie nie
   * ma prawa wymagac logowania.
   *
   * @returns czy wolno publikowac
   */
  const ensurePremiumSession = async (): Promise<boolean> => {
    if (!takePremiumDraft()) return true;

    setBlockedOnPremiumSignIn(false);
    if (siweAddressRef.current) return true;

    const toastId = toast.loading(
      'One signature first - a paid post has to be provably yours. No gas, no transaction.'
    );

    let signedIn = false;
    try {
      signedIn = await siweSignIn();
    } catch (error) {
      console.error('[premium] logowanie SIWE przed publikacja nie powiodlo sie:', error);
    } finally {
      toast.dismiss(toastId);
    }

    // Nic nie powstalo - powod zostaje na ekranie przy kompozytorze, bo tam
    // jest szkic i tam czlowiek patrzy.
    if (!signedIn) setBlockedOnPremiumSignIn(true);

    return signedIn;
  };

  /**
   * Nanosi znacznik platnosci na post, ktory WLASNIE zostal zapieczetowany.
   *
   * Wczesniej te pola byly doklejane OPTYMISTYCZNIE, przed zapisem - i wlasnie
   * stad brala sie glowna skarga: gdy pieczetowanie padalo, autor dalej widzial
   * blok premium (stan Reacta plus cache w localStorage), a czytelnik widzial
   * zwykly post. Znacznik pojawia sie teraz WYLACZNIE po potwierdzeniu z
   * serwera, czyli dokladnie wtedy, gdy to samo zobaczy kazdy inny.
   */
  const markPostAsPremium = (postId: string, draft: PremiumComposerValue) => {
    const apply = (post: ExtendedPost): ExtendedPost => ({
      ...post,
      hasPremium: true,
      unlockPrice: draft.unlockPrice,
      unlockToken: draft.unlockToken,
    });

    setPosts(currentPosts => currentPosts.map(post => (post.id === postId ? apply(post) : post)));
    patchPostInCache(postId, apply);
  };

  /**
   * Zapieczetowanie platnej tresci PO powstaniu posta.
   *
   * Kolejnosc jest wymuszona przez trase: sprawdza ona autorstwo po prawdziwym
   * dokumencie, wiec post musi juz istniec. Sesja jest za to zalatwiona
   * WCZESNIEJ (ensurePremiumSession), zeby ta funkcja nie byla pierwszym
   * miejscem, w ktorym autor slyszy o podpisie.
   *
   * AWARIA NIE MOZE BYC CICHA ANI KOSMETYCZNA. Gdy zapis padnie, post zostaje
   * zwyklym, darmowym postem - i tak tez wyglada dla autora. Szkic ladujemy do
   * `pendingPremium`, zeby dalo sie dokonczyc jednym klknieciem.
   *
   * @returns czy platna czesc jest zapisana
   */
  const sealPremiumContent = async (
    postId: string,
    draft: PremiumComposerValue | null
  ): Promise<boolean> => {
    // Brak platnej czesci to nie jest porazka - nie ma czego pieczetowac.
    if (!draft || !postId || postId.startsWith('temp-')) return true;

    try {
      const response = await fetch('/api/premium', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          content: draft.premiumContent,
          unlockPrice: draft.unlockPrice,
          unlockToken: draft.unlockToken,
        }),
      });

      if (response.ok) {
        markPostAsPremium(postId, draft);
        setPendingPremium(null);
        return true;
      }

      const data = await response.json().catch(() => ({}));
      console.error('[premium] nie udalo sie zapieczetowac tresci:', response.status, data);

      // Brak sesji to jedyny blad, ktory autor moze naprawic sam i od razu.
      const needsSignIn = response.status === 401;
      const reason = needsSignIn
        ? 'We could not confirm it was you, so the paid text was not stored.'
        : data?.code === 'store_unavailable'
          ? 'Paid content is switched off on this deployment, so nothing was hidden.'
          : 'The paid text did not reach our storage.';

      setPendingPremium({ postId, draft, needsSignIn, reason });
      toast.error('Your post is up as a free post - its paid part did not save. You can finish it below.');
      return false;
    } catch (error) {
      console.error('[premium] blad sieci przy pieczetowaniu:', error);
      setPendingPremium({
        postId,
        draft,
        needsSignIn: false,
        reason: 'We could not reach the server, so the paid text was not stored.',
      });
      toast.error('Your post is up as a free post - its paid part did not save. You can finish it below.');
      return false;
    }
  };

  /**
   * Dokonczenie platnej czesci dla posta, ktory juz istnieje. Zaczyna od
   * podpisu, gdy to jego brakowalo - inaczej pierwsza proba skonczylaby sie
   * tym samym 401.
   */
  const retryPremiumSeal = async () => {
    if (!pendingPremium || isRetryingPremium) return;

    setIsRetryingPremium(true);
    try {
      if (!siweAddressRef.current) {
        const toastId = toast.loading(
          'One signature - it proves this post is yours. No gas, no transaction.'
        );
        let signedIn = false;
        try {
          signedIn = await siweSignIn();
        } catch (error) {
          console.error('[premium] logowanie SIWE przed ponowieniem nie powiodlo sie:', error);
        } finally {
          toast.dismiss(toastId);
        }
        if (!signedIn) {
          toast.error('Still not signed in, so the paid part stays unsaved. Your text is kept here.');
          return;
        }
      }

      const sealed = await sealPremiumContent(pendingPremium.postId, pendingPremium.draft);
      if (sealed) toast.success('Paid part saved. Readers can buy it now.');
    } finally {
      setIsRetryingPremium(false);
    }
  };

  // Hashtagi i wzmianki z tresci posta.
  const extractTagsAndMentions = (content: string) => ({
    tags: Array.from(new Set((content.match(/#(\w+)/g) || []).map(tag => tag.slice(1)))),
    mentions: Array.from(new Set((content.match(/@(\w+)/g) || []).map(mention => mention.slice(1)))),
  });

  // Wyslanie zalacznika na /api/upload. Zwraca URL pod wlasciwym kluczem oraz typ
  // MIME (potrzebny metadanym Zory). Brak zalacznika = same nulle, bez zapytania.
  const uploadPostMedia = async (): Promise<{
    imageUrl: string | null;
    videoUrl: string | null;
    mediaMimeType: string | undefined;
  }> => {
    const mediaContent = postPreviewImage || postPreviewVideo;
    if (!mediaContent) return { imageUrl: null, videoUrl: null, mediaMimeType: undefined };

    setUploadProgress(0);
    const base64Response = await fetch(mediaContent);
    const blob = await base64Response.blob();

    const isVideo = postPreviewVideo !== null;
    const fileExtension = blob.type.split('/')[1] || (isVideo ? 'mp4' : 'jpg');
    const fileName = `post-media-${Date.now()}.${fileExtension}`;

    const formData = new FormData();
    formData.append('file', blob, fileName);

    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to upload media: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    setUploadProgress(100);

    return {
      imageUrl: isVideo ? null : data.url,
      videoUrl: isVideo ? data.url : null,
      mediaMimeType: blob.type,
    };
  };

  // Czyszczenie formularza po udanej publikacji.
  const resetComposer = () => {
    setNewPost('');
    setPremium(EMPTY_PREMIUM);
    setIsPremiumOpen(false);
    // Ostrzezenie "nic nie zostalo opublikowane" dotyczy PRZERWANEJ proby -
    // po udanej publikacji nie ma prawa zostac na ekranie.
    setBlockedOnPremiumSignIn(false);
    setPostPreviewImage(null);
    setPostPreviewVideo(null);
    setUploadProgress(0);
    setSelectedMusic(null);
  };


  // Obsługa sukcesu transakcji
  const handleTransactionSuccess = (txHash: string) => {
    // Jeśli już trwa tworzenie posta, nie wywołuj ponownie
    if (isCreatingPost) {
      console.log('Post creation already in progress, ignoring duplicate transaction success');
      return;
    }
    
    // Zapisz txHash i wywołaj nową funkcję dla prostych postów onchain
    // zamiast tworzenia tokena Zora
    handleOnchainPostSuccess(txHash);
  };

  // Nowa funkcja do obsługi prostych postów onchain (bez tokena Zora)
  const handleOnchainPostSuccess = async (txHash: string) => {
    if (!isConnected || !address || !newPost.trim()) {
      toast.error("Wallet not connected or post content empty");
      return;
    }

    if (isCreatingPost) {
      console.log('Post creation already in progress, ignoring duplicate request');
      toast("Post creation in progress...", { icon: '⏳' });
      return;
    }

    setIsCreatingPost(true);
    const toastId = toast.loading("Creating post...");

    // Szkic platnej czesci bierzemy TERAZ - `resetComposer()` nizej wyczysci
    // pole, a pieczetowanie dzieje sie dopiero po zapisie w Firestore.
    const premiumDraft = takePremiumDraft();

    try {
      // 1. Handle media upload (image or video) - jeśli istnieje
      const { imageUrl, videoUrl } = await uploadPostMedia();

      // Extract hashtags and mentions
      const { tags, mentions } = extractTagsAndMentions(newPost);

      // 2. ✅ OPTIMISTIC UPDATE: Dodaj post na górę NATYCHMIAST (zamiast 15 Firebase reads)
      const tempPostId = 'temp-' + Date.now();
      const newPostObject = {
        id: tempPostId,
        author: address,
        // Znacznika platnosci TU NIE MA celowo. Post jest platny dopiero po
        // udanym zapisie tresci (markPostAsPremium w sealPremiumContent) -
        // inaczej autor ogladalby paywall, ktorego nikt inny nie widzi.
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        likes: 0,
        likedBy: [],
        comments: [],
        txHash: txHash,
        network: 'base' as 'base' | 'basecamp',
        isPinned: false,
        musicTrack: selectedMusic // 🎵 Dodaj wybrany utwór do optimistic update
      };

      // Dodaj post na górę listy NATYCHMIAST
      setPosts(currentPosts => [newPostObject, ...currentPosts]);
      // ...oraz do ZAPISANYCH list. Bez tego post istnial tylko w stanie
      // Reacta i znikal po przejsciu na inna zakladke i powrocie, bo widok
      // odtwarzal sie z cache'u sprzed publikacji.
      prependPostToCache(newPostObject as ExtendedPost);

      // 3. Save to Firebase w tle (bez czekania na UI)
      createPost({
        author: address,
        content: newPost,
        ...buildPremiumWriteFields(),
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        visibility: 'public',
        txHash: txHash, // Zapisz hash transakcji onchain
        network: 'base', // Identify as a Base network post
        musicTrack: selectedMusic // 🎵 Dodaj wybrany utwór
      }).then((realPostId) => {
        // Zaktualizuj tempPost z prawdziwym ID z Firebase
        setPosts(currentPosts =>
          currentPosts.map(post =>
            post.id === tempPostId ? { ...post, id: realPostId } : post
          )
        );
        // To samo w cache - inaczej po odswiezeniu strony zostawalby wpis
        // z ID "temp-...", ktory wyglada jak post, ale prowadzi donikad.
        replacePostIdInCache(tempPostId, realPostId);

        // Platna czesc DOPIERO TERAZ - trasa sprawdza autorstwo po prawdziwym
        // dokumencie, wiec musi istniec. Celowo bez `await`: post jest juz
        // widoczny, a pieczetowanie samo dopisze znacznik platnosci albo
        // powie, ze go nie ma.
        void sealPremiumContent(realPostId, premiumDraft);
      }).catch((error) => {
        console.error('Error saving post to Firebase:', error);
        // W przypadku błędu, usuń optimistic post - RAZEM z cache'em, inaczej
        // nieudany post przezylby odswiezenie strony.
        setPosts(currentPosts => currentPosts.filter(post => post.id !== tempPostId));
        clearPostsCache();
        toast.error('Failed to save post');
      });

      // 4. Update UI
      toast.success('Your post is up!', { id: toastId });
      resetComposer();

      // ✅ OPTYMALIZACJA: Usunięto refreshPosts() - oszczędność 15 Firebase reads po każdym poście!

      // 5-8. Liczniki i punkty. Post jest juz zapisany, wiec bledy tych zapisow
      // NIE moga cofnac komunikatu sukcesu - wczesniej wyjatek z licznika
      // dziennego albo postCount leczial do glownego catch i pokazywal
      // "Failed to create post" nad postem, ktory wlasnie sie udal.
      try {
        // 5. Increment daily count
        await updateDoc(doc(db, 'users', address), {
          [`dailyPosts.${today}`]: increment(1)
        });

        // 6. Update user stats
        await updateDoc(doc(db, 'users', address), {
          postCount: increment(1)
        });
      } catch (error) {
        console.log("Error updating user counters, but post was created:", error);
      }

      // 7. Update global stats
      try {
        await setDoc(doc(db, 'stats', 'global'), {
          posts: increment(1)
        }, { merge: true }); // Użyj setDoc z merge: true zamiast updateDoc
      } catch (error) {
        console.log("Error updating global stats, but post was created:", error);
        // Nie przerywamy procesu tworzenia posta, tylko logujemy błąd
      }

      // 8. Calculate and update BaseChatPoints
      try {
        await calculateAndSaveBaseChatPoints();
      } catch (error) {
        console.log("Error calculating BaseChatPoints, but post was created:", error);
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error(`Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
    } finally {
      setIsCreatingPost(false);
    }
  };

  // 🎵 Funkcje obsługi muzyki
  const handleSelectMusic = (track: any) => {
    setSelectedMusic(track);
    console.log('🎵 Selected music track:', track.name, 'by', track.artists.map((a: any) => a.name).join(', '));
  };

  const handleRemoveMusic = () => {
    setSelectedMusic(null);
  };

  // Modyfikacja handleCreatePost, aby odświeżał posty po dodaniu nowego posta
  const handleCreatePost = async () => { // Function for Zora token creation
    // Ensure clients are available
    if (!isConnected || !address || !newPost.trim() || !publicClient || !walletClient) {
        toast.error("Wallet not connected or client not ready.");
        return;
    }

    // Jeśli już trwa tworzenie posta, nie kontynuuj
    if (isCreatingPost) {
      console.log('Post creation already in progress, ignoring duplicate request');
      toast("Post creation in progress...", { icon: '⏳' }); // Use default toast for info/warning
      return;
    }

    // PODPIS PRZED CZYMKOLWIEK. Dalej jest wgrywanie mediow, transakcja Zory
    // i zapis do Firestore - kazde z tych trzech zostawia slad, ktorego nie da
    // sie cofnac. Post bez platnej czesci przechodzi tedy bez pytania.
    if (!(await ensurePremiumSession())) return;

    // Szkic bierzemy po podpisie, a przed `resetComposer()` na koncu sciezki.
    const premiumDraft = takePremiumDraft();

    // Ustaw flagę blokującą wielokrotne tworzenie postów
    setIsCreatingPost(true);
    const toastId = toast.loading("Creating post token..."); // Store toast ID
    
    // Zadeklarowane PRZED `try`, zeby sciezka awaryjna w `catch` (zwykly post
    // zamiast tokena) widziala juz wgrane media. Wczesniej byly tu deklarowane
    // po raz drugi wewnatrz `try` - przeslanialy te zmienne, wiec post awaryjny
    // zawsze gubil zdjecie albo wideo.
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let mediaMimeType: string | undefined = undefined;

    try {
      console.log('🚀 Starting Zora coin creation for post...');

      // 1. Handle media upload (image or video)
      ({ imageUrl, videoUrl, mediaMimeType } = await uploadPostMedia());
      if (imageUrl || videoUrl) {
        console.log("Media uploaded:", videoUrl || imageUrl);
      }

      // 2. Generate Metadata
      const postContentExcerpt = newPost.length > 100 ? newPost.substring(0, 97) + "..." : newPost;
      const { tags: contentTags, mentions: contentMentions } = extractTagsAndMentions(newPost);
      const metadata = {
        name: `Post by ${userProfile.name || address.slice(0,6)}: ${postContentExcerpt}`, // Example name
        description: newPost,
        image: imageUrl || '', // Use uploaded image URL or empty string
        ...(videoUrl && { animation_url: videoUrl }), // Add animation_url if video exists
        ...(videoUrl && mediaMimeType && { // Add Zora 'content' extension if video
          content: {
            mime: mediaMimeType,
            uri: videoUrl
          }
        }),
        properties: {
          category: "social", // Example property
          author: address,
          createdAt: new Date().toISOString(),
          tags: contentTags,
          mentions: contentMentions
        }
      };

      // 3. Upload Metadata using /api/upload
      console.log("Uploading metadata JSON via /api/upload...");
      const metadataJsonString = JSON.stringify(metadata);
      const metadataBlob = new Blob([metadataJsonString], { type: 'application/json' });
      const metadataFileName = `metadata-${Date.now()}.json`;

      const metadataFormData = new FormData();
      metadataFormData.append('file', metadataBlob, metadataFileName);

      const metadataUploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: metadataFormData,
      });

      if (!metadataUploadResponse.ok) {
          const errorData = await metadataUploadResponse.json();
          throw new Error(`Failed to upload metadata: ${errorData.error || metadataUploadResponse.statusText}`);
      }

      const metadataUploadData = await metadataUploadResponse.json();
      const metadataUri = metadataUploadData.url; // Get the URL from the response
      if (!metadataUri) {
          throw new Error("Metadata URI not returned from upload");
      }
      console.log("Metadata URI:", metadataUri);

              // 4. Prepare Coin Parameters for Zora SDK
        // Clean and validate parameters according to Zora SDK documentation
        const cleanName = `MySphere Post by ${userProfile.name || address.slice(0,6)}`.substring(0, 32).trim();
        const firstWord = newPost.trim().split(/\s+/)[0];
        const cleanSymbol = firstWord.replace(/[^A-Z0-9]/gi, '').substring(0, 10).toUpperCase() || 'POST';
        
        // SDK Zory ladowany na zadanie - uzywany tylko w tym jednym handlerze,
        // a na topie pliku szedlby do initial chunka kazdej sesji basechatu.
        // Musi stac PRZED budowaniem parametrow: CreateConstants sa im potrzebne.
        const { createCoin, getCoinCreateFromLogs, CreateConstants } = await import('@zoralabs/coins-sdk');

        /**
         * Parametry wg AKTUALNEGO API @zoralabs/coins-sdk 0.8 (docs.zora.co).
         *
         * Poprzednia wersja uzywala podpisu 0.x - trzy argumenty pozycyjne,
         * pola `uri`, `owners`, `payoutRecipient` - przez co przycisk "PostCoin"
         * NIE MOGL zadzialac od czasu podbicia zaleznosci. Blad byl niewidoczny,
         * bo caly plik mial wtedy `@ts-nocheck`.
         *
         * DWIE DECYZJE PRODUKTOWE, ktorych nowe API wymaga:
         *
         * `currency: ETH` - a nie ZORA ani CREATOR_COIN. Powod jest prosty:
         * ETH ma kazdy, kto w ogole doszedl do tego przycisku, bo placi nim za
         * gaz. Wymaganie ZORA znaczyloby, ze zanim ktokolwiek wybije monete
         * ze swojego posta, musi najpierw kupic obcy token - czyli sciezka
         * konczy sie porazka dla wiekszosci ludzi. Jako jedyna z czterech opcji
         * ETH dziala tez na Base Sepolia, wiec da sie ja przetestowac bez
         * wydawania prawdziwych pieniedzy.
         *
         * `startingMarketCap: LOW` - najnizszy prog wejscia. HIGH ustawia
         * wysoka wycene startowa, co przy poscie w feedzie spolecznosciowym
         * nie ma uzasadnienia: to nie jest zbiorka, tylko slad po tresci.
         */
        const coinParams = {
          creator: address as ViemAddress,
          name: cleanName,
          symbol: cleanSymbol,
          metadata: { type: 'RAW_URI' as const, uri: metadataUri },
          currency: CreateConstants.ContentCoinCurrencies.ETH,
          chainId: base.id,
          startingMarketCap: CreateConstants.StartingMarketCaps.LOW,
          platformReferrer: "0x9fb014812e5c22643640a5885866f499b1bbb5e0" as ViemAddress,
        };
              console.log("Zora coin parameters:", coinParams);
        
        // Validate parameters before calling createCoin  
        if (!coinParams.name || coinParams.name.length === 0) {
          throw new Error("Token name cannot be empty");
        }
        if (!coinParams.symbol || coinParams.symbol.length === 0) {
          throw new Error("Token symbol cannot be empty"); 
        }
        if (!metadataUri || !metadataUri.startsWith('http')) {
          throw new Error("Invalid metadata URI - must be a valid HTTP/HTTPS URL");
        }
        
        // 5. Call createCoin (SDK zaladowany wyzej, razem z CreateConstants)
      console.log("Calling createCoin via Zora SDK...");
      // Make sure walletClient is not null/undefined before calling createCoin
      if (!walletClient) {
          throw new Error("Wallet client is not available.");
      }
      // Dwuetapowe API 0.8: jeden obiekt `call` plus oba klienty.
      const result = await createCoin({
        call: coinParams,
        walletClient,
        publicClient,
      });

      console.log("Zora coin creation transaction sent:", result.hash);
      toast.loading("Waiting for transaction confirmation...", { id: toastId });

      // Wait for the transaction to be confirmed
      const receipt = await publicClient.waitForTransactionReceipt({ hash: result.hash });
      console.log("Transaction confirmed:", receipt);

      // 6. Get Coin Address from logs
      const coinDeployment = getCoinCreateFromLogs(receipt);
      if (!coinDeployment?.coin) {
        throw new Error("Could not extract coin address from transaction logs.");
      }
      const zoraCoinAddress = coinDeployment.coin;
      console.log("Successfully created Zora Coin Address:", zoraCoinAddress);


      // Extract hashtags and mentions (already done for metadata)
      const tags = metadata.properties.tags;
      const mentions = metadata.properties.mentions;

      // 7. Save to Firebase (including the new zoraCoinAddress)
      console.log("Saving post data to Firebase...");
      // `as const`, inaczej typ rozszerza sie do `string`, a createPost przyjmuje
      // tylko 'public' | 'followers' | 'private'.
      const visibilityValue = 'public' as const;
      const postDataForFirebase = {
        author: address,
        content: newPost,
        ...buildPremiumWriteFields(),
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        visibility: visibilityValue, // Use simple string
        zoraCoinAddress: zoraCoinAddress, // <-- Save the Zora Coin address
        txHash: result.hash, // <-- Save the Zora creation tx hash
        musicTrack: selectedMusic // 🎵 Dodaj wybrany utwór
      };

      // Optimistic UI update (Add temporary post)
      const tempPost: ExtendedPost = {
        id: `temp-${Date.now()}`,
        author: address,
        // Bez znacznika platnosci - dokleja go dopiero udane pieczetowanie.
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl ?? undefined, // Ensure undefined if null
        video: videoUrl ?? undefined, // Ensure undefined if null
        tags: tags,
        mentions: mentions,
        visibility: visibilityValue, // Use simple string
        zoraCoinAddress: zoraCoinAddress,
        txHash: result.hash,
        likes: 0,
        likedBy: [],
        comments: []
      };
      setPosts(currentPosts => [tempPost, ...currentPosts]);

      // Actual Firebase save - dokladnie ten sam obiekt, ktory zostal zlozony wyzej.
      // Wczesniej byl skladany drugi raz recznie i obie kopie zdazyly sie rozjechac.
      const zoraPostId = await createPost(postDataForFirebase);
      console.log("Post saved to Firebase.");

      // Dopisujemy post do zapisanych list zamiast kasowac caly cache.
      // Kasowanie dzialalo, ale kazalo potem pobrac WSZYSTKIE listy od nowa -
      // czyli placilismy pelnym przeladowaniem feedu za jeden post, ktorego
      // tresc i tak mamy w pamieci. Firestore liczy za kazdy odczyt dokumentu.
      //
      // MUSI STAC PRZED PIECZETOWANIEM: znacznik platnosci nanosi
      // markPostAsPremium po ID, wiec post musi juz byc w stanie i w cache'u
      // pod PRAWDZIWYM identyfikatorem. Inaczej cache trzymalby przez pieć
      // minut wersje "darmowa" posta, ktory w bazie jest platny.
      setPosts(currentPosts =>
        currentPosts.map(post => (post.id === tempPost.id ? { ...post, id: zoraPostId } : post))
      );
      prependPostToCache({ ...tempPost, id: zoraPostId } as ExtendedPost);

      // Platna czesc idzie do zapieczetowanej kolekcji, nie do dokumentu posta -
      // patrz sealPremiumContent. Z `await`, bo kilka linii nizej ta sciezka
      // NADPISUJE cala liste swiezym odczytem z Firestore: bez czekania wyscig
      // konczyl sie postem, ktory jest platny w bazie, a wyglada na darmowy.
      await sealPremiumContent(zoraPostId, premiumDraft);

      // Refresh posts list from Firebase to get the real ID
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);

      // Reset form
      resetComposer();

      // Show success message
      toast.dismiss(toastId);
      toast.success('Your post is up as a Zora token!');



    } catch (error: any) {
      console.error('Error creating Zora coin post:', error);
      toast.dismiss(toastId); // Ensure loading toast is dismissed on error
      
      // Determine the specific error type and show appropriate message.
      // `rawMessage` zamiast `error.message`: rzucone moze byc cokolwiek (string,
      // obiekt bez `message`), a wtedy samo `error.message.includes(...)` rzucalo
      // TypeError wewnatrz catch - sciezka awaryjna nie startowala, toast
      // "trwa tworzenie" zostawal na ekranie na zawsze, a `finally` nie zdazyl
      // odblokowac przycisku w czytelny sposob.
      const rawMessage = typeof error?.message === 'string' ? error.message : String(error ?? '');
      let errorMessage = 'Unknown error occurred while creating post';
      let shouldFallback = false;

      if (rawMessage.includes('execution reverted') || rawMessage.includes('ContractFunctionExecutionError')) {
        errorMessage = 'Token creation failed due to contract error. Creating as regular post instead.';
        shouldFallback = true;
      } else if (rawMessage.includes('Missing or invalid parameters')) {
        errorMessage = 'Invalid token parameters. Creating as regular post instead.';
        shouldFallback = true;
      } else if (rawMessage.includes('insufficient funds')) {
        errorMessage = 'Not enough ETH for gas, so the token was not created. Top up and try again.';
      } else if (rawMessage.includes('user rejected')) {
        errorMessage = 'You cancelled the transaction in your wallet.';
      } else if (rawMessage.includes('Failed to upload')) {
        errorMessage = 'Failed to upload media or metadata. Please try again.';
      } else if (rawMessage.includes('Token name cannot be empty') ||
                 rawMessage.includes('Token symbol cannot be empty') ||
                 rawMessage.includes('Invalid metadata URI')) {
        errorMessage = rawMessage;
      } else if (rawMessage) {
        errorMessage = rawMessage.substring(0, 100);
      }
      
      // Try fallback to regular post if token creation failed
      if (shouldFallback) {
        try {
          console.log('Attempting fallback to regular post...');
          toast.loading('Creating as regular post...', { id: toastId });
          
          // Extract hashtags and mentions
          const { tags, mentions } = extractTagsAndMentions(newPost);

          // Create regular post without token
          const fallbackPostId = await createPost({
            author: address,
            content: newPost,
            ...buildPremiumWriteFields(),
            timestamp: Date.now(),
            image: imageUrl ?? undefined,
            video: videoUrl ?? undefined,
            tags: tags,
            mentions: mentions,
            visibility: 'public',
            network: 'base', // Identify as a Base network post without token
            musicTrack: selectedMusic // 🎵 Dodaj wybrany utwór do fallback post
          });

          // TA SCIEZKA TEZ PIECZETUJE. Jest ratunkiem po nieudanym tworzeniu
          // monety, ale platna czesc autora nie ma z tym nic wspolnego -
          // pominiecie jej tutaj gubiloby ja po cichu dokladnie wtedy, gdy
          // cos juz poszlo nie tak.
          await sealPremiumContent(fallbackPostId, premiumDraft);

          // Update UI
          toast.success('Your post is up!', { id: toastId });
          resetComposer();

          // Tutaj KASUJEMY cache, zamiast dopisywac - inaczej niz w sciezkach
          // powyzej. Powod: ta galaz nie zbudowala obiektu posta (jest
          // ratunkiem po nieudanym tworzeniu monety), wiec nie ma czego
          // dopisac, a loadPosts czyta cache PRZED siegnieciem do Firestore
          // i bez tego pokazalby liste sprzed posta. To sciezka awaryjna,
          // wiec pelne przeladowanie jest tu akceptowalna cena.
          clearPostsCache();

          // Refresh posts
          await refreshPosts();

        } catch (fallbackError) {
          console.error('Fallback post creation also failed:', fallbackError);
          toast.error('Failed to create post. Please try again.', { id: toastId });
        }
      } else {
        toast.error(`Error creating post: ${errorMessage}`);
      }
      
      // Log detailed error for debugging
      console.error('Detailed error:', {
        message: rawMessage,
        stack: error?.stack,
        name: error?.name,
        cause: error?.cause
      });
    } finally {
      // Zawsze resetuj flagę blokującą, nawet w przypadku błędu
      setIsCreatingPost(false);
    }
  };

  // Usuniete jako martwe: handleAddComment, handleToggleLike i formatTimestamp.
  // Komentarze, polubienia i format czasu obsluguje PostList wlasnymi funkcjami.

  // Funkcja do pobierania trendujących hashtagów z postów
  const getTrendingTags = (posts: Post[]) => {
    const tagCounts = new Map<string, number>();
    
    posts.forEach(post => {
      post.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  // Dodaj nowy stan dla statusu ładowania
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  // Dodaj stan do śledzenia, czy dane zostały już odświeżone po starcie
  const [initialRefreshDone, setInitialRefreshDone] = useState(false);
  // Dodaj stan do śledzenia, czy można odświeżyć dane ręcznie
  const [canManuallyRefresh, setCanManuallyRefresh] = useState(true);

  // Funkcja do szybkiego ładowania podstawowych danych z localStorage
  const loadInitialData = useCallback(() => {
    try {
      const cachedData = localStorage.getItem('activeUsers');
      const cachedNames = localStorage.getItem('userNames');
      
      if (cachedData) {
        const parsedUsers = JSON.parse(cachedData);
        // Sprawdź czy cache nie jest za stary (max 10 minut)
        const cacheTime = localStorage.getItem('usersCacheTime');
        const isStale = !cacheTime || (Date.now() - parseInt(cacheTime)) > 10 * 60 * 1000;
        
        if (!isStale) {
          setActiveUsers(parsedUsers);
          setIsLoadingUsers(false);
          console.log('📋 Loaded cached users data');
        }
      }
        
      if (cachedNames) {
        setUserNames(JSON.parse(cachedNames));
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  }, []);

  // 🚀 ZOPTYMALIZOWANA funkcja getActiveUsers została przeniesiona za deklaracje zmiennych stanu

  // useEffect do ustawienia isMounted i wczytania cache'u.
  // Sprzatanie nie ustawia juz isMounted na false - to zapis do stanu
  // odmontowanego komponentu, ktory nic nie dawal, bo komponent i tak znikal.
  useEffect(() => {
    setIsMounted(true);
    loadInitialData(); // Załaduj cache od razu
  }, [loadInitialData]);

  // Usuniete jako martwe: handleCreateGroup - grupy nie maja zadnego UI.


  // ⚠️ OPTIMIZED - 12h cache per user for global stats using same system as main page
  /**
   * Globalne liczniki - JEDEN odczyt prawdziwego dokumentu.
   *
   * === CO TU BYLO ===
   * Ta funkcja nie czytala NICZEGO. Zwracala liczby wpisane na sztywno
   * (userCount: 175708, postsCount: 239961, ...) i mnozyla kazda przez losowy
   * wspolczynnik +/-1% z komentarzem "dla realizmu" - czyli licznik zmienial
   * sie na oczach czytelnika przy kazdym wejsciu, zeby wygladac na zywy,
   * bedac wymyslonym.
   *
   * Zmierzone tego samego dnia na produkcyjnej bazie: 184 064 uzytkownikow
   * (na ekranie 175 708), 263 613 postow (239 961), 13 492 komentarze
   * (10 972). Na produkcie o sprawdzalnych liczbach pierwsze cztery liczby
   * na ekranie byly nabite.
   *
   * Teraz czytamy jeden dokument, ktory zapisuje panel admina po swoim
   * przeliczeniu. Jeden odczyt na wejscie zamiast 467, liczby prawdziwe,
   * a przy braku pomiaru pokazujemy PUSTKE, nie wymyslona wartosc.
   *
   * === LAJKI SA SKLADANE, NIE CZYTANE Z JEDNEGO POLA ===
   * Bylo tu `setTotalLikes(stats.likes)`, a pola `likes` w tym dokumencie NIE
   * MA i dlugo nie bedzie: panel admina zapisuje je jawnie jako `null`, bo
   * lajkow nie da sie policzyc agregacja (siedza jako pole na 263 613 postach).
   * Odczytany dokument mial `likesSince: 6` i zadnego `likes` - czyli jedyna
   * istniejaca liczba lajkow byla po prostu POMIJANA przy odczycie. Kafel
   * dostawal potem `String(null)`, czyli napis "null".
   *
   * `likesTotal()` sklada to, co wiadomo: stan poczatkowy (gdy ktos go policzyl
   * skryptem) plus licznik przyrostowy. Gdy suma nie jest dokladna, `likesNote()`
   * i `likesDetail()` daja gotowe zastrzezenie - krotkie na kafel, pelne do
   * dymka. Strona ich NIE SKLADA i nie ma prawa: to warstwa danych wie, czy
   * brakuje poczatku, czy srodka, a to sa dwa rozne zdania.
   */
  const fetchGlobalStats = async () => {
    const { stats, failed } = await getGlobalStats();

    if (failed || !stats) {
      // Brak pomiaru i nieudany odczyt to dwa rozne zdania, ale dla licznika
      // skutek jest ten sam: NIE WIEMY. `null` renderuje sie jako kreska,
      // a nie jako zero ani jako zmyslona liczba.
      setTotalUsers(null);
      setTotalLikes(null);
      setLikesNoteText(undefined);
      setLikesDetailText(undefined);
      setTotalPosts(null);
      setTotalComments(null);
      setTotalTips(null);
      setStatsMeasuredAt(0);
      return;
    }

    const likes = likesTotal(stats);

    setTotalUsers(stats.users);
    setTotalLikes(likes.value);
    setLikesNoteText(likesNote(likes));
    setLikesDetailText(likesDetail(likes));
    setTotalPosts(stats.posts);
    setTotalComments(stats.comments);
    setTotalTips(stats.tips);
    setStatsMeasuredAt(stats.measuredAt);
  };

  // ⚠️ OPTIMIZED: Global stats loaded immediately on component mount
  useEffect(() => {
    // Load global stats immediately for all visitors
    fetchGlobalStats();
  }, []); // Run only once on component mount

  // ⚠️ OPTIMIZED: User-specific features with 12h cache per user
  useEffect(() => {
    if (address) {
      // Store user address for cache system
      localStorage.setItem('userAddress', address);
      
      // 🚫 DISABLED: User search cache to save Firebase reads (1000 reads per user visit)
      // const initUserSearchCache = async () => {
      //   try {
      //     await preloadUserSearchCache();
      //     console.log(`⚡ User search cache preloaded in background (localStorage friendly)`);
      //   } catch (error) {
      //     console.error('❌ User search cache preload failed:', error);
      //   }
      // };
      // 
      // initUserSearchCache();
      
      console.log('💰 User search DISABLED - saving $1,200/day (1000 reads × 20k users)');
    }
    // No auto-refresh - cache lasts 12h per user
  }, [address]);

  // Usuniete jako martwe: handleDeletePost - kasowanie posta obsluguje PostList.

  // useEffect do pobierania profilu użytkownika
  const savedNameWrittenRef = useRef<string | null>(null);
  useEffect(() => {
    if (isConnected && address) {
      const loadUserProfile = async () => {
        if (!address) return;
        
        try {
          // Rownolegle zamiast seryjnie - to dwa niezalezne odczyty.
          const [profile, savedName] = await Promise.all([
            fetchUserProfile(address, { loadSocialLinks: true }),
            getProfileName(address)
          ]);
          
          if (profile) {
            // Ustaw profil z odpowiednią nazwą
            setUserProfile({
              name: baseName || savedName || profile.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
              avatar: profile.avatar,
              postCount: profile.postsCount || 0,
              likesReceived: profile.likesReceived || 0,
              address: address,
              bio: profile.bio,
              socialLinks: profile.socialLinks
            });
            
            // Zapis TYLKO gdy BaseName rzeczywiscie sie zmienil. Wczesniej byl to
            // bezwarunkowy WRITE przy kazdym przebiegu efektu (min. 2x przez dep
            // baseName, x2 w StrictMode).
            if (baseName && savedNameWrittenRef.current !== baseName) {
              savedNameWrittenRef.current = baseName;
              if (savedName !== baseName) {
                await saveProfileName(address, baseName);
              }
              setUserNames(prev => ({
                ...prev,
                [address]: {
                  name: baseName,
                  avatar: profile.avatar
                }
              }));
            }
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
        }
      };

      loadUserProfile();
    }
  }, [isConnected, address, baseName]);

  // Dodaj nowy useEffect do resetowania stanu przy zmianie portfela
  useEffect(() => {
    const resetStats = async () => {
      if (!address) {
        // Reset stanu przy braku portfela
        setUserProfile({
          name: '',
          avatar: undefined,
          postCount: 0,
          likesReceived: 0,
          address: '',
          socialLinks: {
            twitter: '',
            farcaster: '',
            discord: ''
          }
        });
        setPreviewImage(null);
        setUserStats({}); // Reset statystyk użytkowników
        setHoveredUser(null); // Reset hoveredUser
      } else {
        // Jeśli jest adres, pobierz statystyki dla aktualnego użytkownika
        await fetchUserStats(address);
      }
    };
      
    resetStats();
  }, [address]);

  // Dodaj nowy useEffect do pobierania statystyk dla najechanego użytkownika
  useEffect(() => {
    if (hoveredUser) {
      fetchUserStats(hoveredUser);
    }
  }, [hoveredUser]);

  // Zaktualizuj funkcję handleAvatarUpdate
  const handleAvatarUpdate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0] || !address) return;
    
    const file = event.target.files[0];
    const isAdmin = address.toLowerCase() === ADMIN_ADDRESS;
    
    // Sprawdź rozmiar pliku - admin bez limitów, użytkownicy max 3MB
    if (!isAdmin && file.size > 3 * 1024 * 1024) {
      setModalMessage('Maximum file size is 3MB');
      setModalType('error');
      setShowModal(true);
      return;
    }

    // Sprawdź czy można zmienić zdjęcie (tylko dla zwykłych użytkowników)
    if (!isAdmin) {
          const userRef = doc(db, 'users', address);
          const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    
    if (userData?.lastImageUpdate) {
      const lastUpdate = userData.lastImageUpdate.toDate();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      if (lastUpdate > oneMonthAgo) {
        const timeToWait = new Date(lastUpdate.getTime() + 30 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const diff = timeToWait.getTime() - now.getTime();
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        setModalMessage(`You can change your profile picture once a month.\nTime remaining: ${days} days and ${hours} hours`);
        setModalType('warning');
        setShowModal(true);
        return;
        }
      }
    }

    setSelectedFile(file);
    const maxSizeText = isAdmin ? 'No file size limit for admin' : 'Maximum file size: 3MB';
    const timeRestrictionText = isAdmin ? 'Admin can change anytime.' : 'Next change will be possible in one month.';
    setModalMessage(`Are you sure you want to change your profile picture?\n${timeRestrictionText}\n${maxSizeText}`);
    setModalType('confirm');
    setShowModal(true);
  };

  // Funkcja do obsługi potwierdzenia zmiany zdjęcia
  const handleConfirmUpload = async () => {
    if (!selectedFile || !address) return;
    
    try {
      setIsUploading(true);
      
      // Upload do Vercel Blob
      const { url } = await put(selectedFile.name, selectedFile, {
        access: 'public',
        token: process.env.NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN
      });

      // Aktualizuj profil użytkownika
      const userRef = doc(db, 'users', address);
      await updateDoc(userRef, {
        avatar: url,
        lastImageUpdate: new Date()
      });

      // Aktualizuj lokalny stan
      setPreviewImage(url);
      setUserProfile(prev => ({
            ...prev,
        avatar: url
      }));
      
      setShowModal(false);
    } catch (error) {
      console.error('Error updating avatar:', error);
      setModalMessage('Could not save the image. Try again.');
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
    }
  };

  // Stal tu useEffect z PUSTYM cialem i zaleznoscia [address, isConnected, baseName]
  // - pozostalosc po skasowanej funkcji fetchData (odpytywala Firebase co 5 sekund).
  // Sam efekt nic juz nie robil, wiec zniknal razem z komentarzem-nagrobkiem.

  // 🚀 ULTRA-CHEAP Funkcja do pobierania nazw użytkowników (95% oszczędności!)
  const fetchUserNames = async (posts: Post[]) => {
    try {
      // ✅ SMART LOADING: tylko widoczne komentarze (pierwsze 3 na post)
      const names = await getBulkUserNamesVisibleOnly(posts, 3);
      
      // Log cache stats dla debugowania  
      const cacheStats = getUserNamesCacheStats();
      console.log(`📊 User names cache: ${cacheStats.fresh}/${cacheStats.total} fresh (${cacheStats.hitRate} hit rate)`);
      
      // Dodaj BaseName dla aktualnego użytkownika
      if (baseName && address) {
        names[address] = { name: baseName, avatar: undefined };
      }
      
      setUserNames(prev => ({
        ...prev, // Zachowaj stare nazwy w cache
        ...names // Dodaj nowe nazwy
      }));
    } catch (error) {
      console.error('Error fetching user names:', error);
    }
  };

  // useEffect do aktualizacji nazw
  useEffect(() => {
    if (posts.length > 0) {
      fetchUserNames(posts);
    }
  }, [posts, baseName, address]);

  // 🚀 NOWA FUNKCJA: Aktualizacja nazw użytkowników z PinnedPosts
  const handleUserNamesUpdate = useCallback((newUserNames: {[key: string]: {name: string, avatar?: string}}) => {
    setUserNames(prev => ({
      ...prev,
      ...newUserNames // Dodaj nowe nazwy do cache
    }));
  }, []);

  // Sortowanie, filtr postow przypietych i lazy loading zyly tu w drugiej kopii:
  // `searchFilteredPosts` -> `nonPinnedPosts` -> `sortedPosts` -> `displayedPosts`
  // plus `displayLimit` i IntersectionObserver na znaczniku 1px na koncu strony.
  // Nic z tego nie trafialo do renderu - do PostList idzie surowe `posts`, a
  // PostList ma wlasny, kompletny lazy loading (`displayLimit`, przycisk "load
  // more", ten sam limit 150). Jedynym efektem tej kopii bylo dobijanie
  // `displayLimit` o 15 przy kazdym przecieciu znacznika, czyli przerenderowanie
  // calej strony bez zadnej zmiany na ekranie. Zostalo usuniete w calosci
  // razem ze znacznikiem.

  // Usuniete jako martwe: handleEditPost, handleEditComment, handleDeleteComment,
  // handleToggleCommentLike i handleAddReply. Zadna z tych piatki nie byla nigdzie
  // wywolywana ani przekazywana w dol - edycja i kasowanie postow oraz komentarzy
  // maja wlasne, uzywane implementacje w PostList. Kazda kopia trzymala przy tym
  // wlasny optymistyczny update i wlasna sciezke ratunkowa z fetchPosts.

  // Dodaj nową funkcję do obliczania i zapisywania BaseChat Points
  const calculateAndSaveBaseChatPoints = async () => {
      if (!address || !isConnected) return;

      try {
      // Oblicz punkty
      const postPoints = userProfile.postCount * 5;
      const likePoints = userProfile.likesReceived;
      const activityBonus = Math.round((postPoints + likePoints) * 0.25);
      // Nie nadpisuj bonusów – odczytaj istniejące i dolicz do total
      const userRef = doc(db, 'users', address);
      const userSnap = await getDoc(userRef);
      const existing = userSnap.exists() ? (userSnap.data() as any) : {};
      const existingBCP = existing.baseChatPoints || {};
      const baseNameBonus = Number(existingBCP.baseNameBonus || 0);
      const sphereBonus = Number(existingBCP.sphereBonus || 0);
      const camperBonus = Number(existingBCP.camperBonus || 0);
      const celoBonus = Number(existingBCP.celoBonus || 0);
      const worldBonus = Number(existingBCP.worldBonus || 0);
      const referralPoints = Number(existingBCP.referralPoints || 0);
      const totalBaseChatPoints = Math.round((postPoints + likePoints) * 1.25 + baseNameBonus + sphereBonus + camperBonus + celoBonus + worldBonus + referralPoints);

      // Zapisz punkty w Firebase
      await updateDoc(userRef, {
        baseChatPoints: {
          postPoints,
          likePoints,
          activityBonus,
          baseNameBonus,
          sphereBonus,
          camperBonus,
          celoBonus,
          worldBonus,
          referralPoints,
          totalPoints: totalBaseChatPoints,
          lastUpdated: serverTimestamp()
        }
      });

      // ✅ FIREBASE COST OPTIMIZATION: Removed refreshTop50UsersOnly() to save $500-1000/day
      // Ranking updates are handled by:
      // - Automatic refresh every 10 minutes in getActiveUsers()
      // - Manual refresh button click
      // - Login refresh (1 second after connection)
      console.log('✅ BaseChatPoints saved successfully (ranking updates separately)');
    } catch (error) {
      console.error('Error saving BaseChat points:', error);
    }
  };

  // Dodaj useEffect do aktualizacji punktów
  useEffect(() => {
    if (isConnected && address) {
      calculateAndSaveBaseChatPoints();
    }
  }, [userProfile.postCount, userProfile.likesReceived, isConnected, address]);

  // Dodaj nowe stany dla modalu
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsersPages, setTotalUsersPages] = useState(5); // 🚀 LIMIT: Maksymalnie 5 stron

  // Usunieta martwa wyszukiwarka uzytkownikow: `userSearchQuery`, `searchResults`,
  // `isSearching`, `searchTimeoutRef`, `showAllUsers`, `usersPerPage` oraz
  // handleUserSearch(). Sama funkcja byla wylaczona (natychmiastowy `return`,
  // reszta zakomentowana), a zaden z tych stanow nie mial pola ani wyniku w UI.

  // 🚀 ZOPTYMALIZOWANA funkcja getActiveUsers - używa nowej paginowanej funkcji
  const getActiveUsers = useCallback(async (forceRefresh: boolean = false) => {
    if (!db) return;

    try {
      setIsLoadingUsers(true);
      setCanManuallyRefresh(false);
      
      console.log(`🔄 Loading active users page ${currentPage} (force: ${forceRefresh})...`);
      
      // 🚀 NOWA PAGINOWANA FUNKCJA: Pobiera tylko 10 użytkowników zamiast 50!
      const result = await getTopActiveUsersPaginated(currentPage, 10, forceRefresh);
      
      // Aktualizuj userNames tylko dla aktualnej strony
      const userNamesUpdate: {[key: string]: {name: string, avatar?: string}} = {};
      result.users.forEach(user => {
        userNamesUpdate[user.address] = {
          name: user.name,
          avatar: user.avatar
        };
      });
      
      setUserNames(prev => ({
        ...prev,
        ...userNamesUpdate
      }));
      
      // Zapisz do localStorage z timestampem
      localStorage.setItem('activeUsersPage', JSON.stringify(result.users));
      localStorage.setItem('userNames', JSON.stringify(userNamesUpdate));
      localStorage.setItem('usersCacheTime', Date.now().toString());

      // Aktualizuj stan komponentu
      setActiveUsers(result.users);
      // RZECZYWISTA liczba stron, nie stala. Bylo tu `setTotalUsersPages(5)`
      // z komentarzem "zawsze 5 stron maksymalnie" - czyli stopka oglaszala
      // piec stron takze wtedy, gdy danych starczylo na jedna. Dokladnie ten
      // sam blad naprawialem pietro nizej, w getTopActiveUsersPaginated:
      // funkcja raportowala 5 stron i 50 osob, majac w reku 12 rekordow.
      // Skoro zrodlo mowi juz prawde, nie ma powodu jej tutaj nadpisywac.
      setTotalUsersPages(result.totalPages);
      setIsLoadingUsers(false);
      setInitialRefreshDone(true);
      
      // Pozwól na ręczne odświeżenie po 5 sekundach
      setTimeout(() => {
        setCanManuallyRefresh(true);
      }, 5000);
      
      console.log(`✅ Loaded page ${result.currentPage}/5 (${result.users.length} users) - Firebase reads optimized!`);
    } catch (error) {
      console.error('Error fetching active users:', error);
      setIsLoadingUsers(false);
      setCanManuallyRefresh(true);
    }
  }, [db, currentPage]); // 🚀 DODANO: currentPage do dependencies

  // Funkcja do ręcznego odświeżania danych z force refresh
  const handleManualRefresh = useCallback(() => {
    if (canManuallyRefresh) {
      getActiveUsers(true); // Force refresh when manually triggered
    }
  }, [canManuallyRefresh, getActiveUsers]);

  const handleClearNamesCache = useCallback(() => {
    clearUserNamesCache();
    setUserNames({}); // Wyczyść również lokalny state
    // Odśwież nazwy użytkowników dla aktualnych postów
    if (posts.length > 0) {
      fetchUserNames(posts);
    }
    toast.success('User names cache cleared');
  }, [posts, fetchUserNames]);

  // Automatyczne odświeżanie przy pierwszym załadowaniu strony
  useEffect(() => {
    if (isMounted && !initialRefreshDone) {
      // Pobierz aktualne dane z Firebase (bez force refresh - użyj cache'u jeśli dostępny)
      getActiveUsers(false);
      setInitialRefreshDone(true);
    }
  }, [isMounted, initialRefreshDone, getActiveUsers]);
  
  // Force-refresh po zalogowaniu usuniety - omijal OBA poziomy cache i dublowal
  // pobranie zrobione juz przy mouncie. Dane sa odswiezane interwalem ponizej
  // oraz recznie przyciskiem Refresh.
  
  // Regularne odświeżanie co 10 minut (zwiększono z 2 minut)
  useEffect(() => {
    if (isMounted) {
      const refreshInterval = setInterval(() => getActiveUsers(false), 10 * 60 * 1000); // Co 10 minut, używa cache'u
      
      // Cleanup dla interwału
      return () => {
        clearInterval(refreshInterval);
      };
    }
  }, [isMounted, getActiveUsers]);

  // 🚀 useEffect reagujacy na REALNA zmiane currentPage.
  // Bez guarda odpalal sie takze przy mouncie i przy kazdej nowej referencji
  // getActiveUsers, dublujac pobranie z efektu inicjalnego.
  const prevPageRef = useRef(currentPage);
  useEffect(() => {
    if (!initialRefreshDone) return;
    if (prevPageRef.current === currentPage) return;
    prevPageRef.current = currentPage;
    getActiveUsers(false);
  }, [currentPage, getActiveUsers, initialRefreshDone]);

  // Funkcja renderująca pusty element listy
  const renderEmptyItem = (index: number) => (
    <div key={`empty-${index}`} className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all duration-300 opacity-50">
      <div className="w-6 flex-shrink-0">
        <span className="text-[11px] font-bold text-gray-400">
          #{index + 1}
        </span>
      </div>
      <div className="w-8 h-8 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center">
          <span className="text-[11px] font-medium text-gray-400">···</span>
        </div>
        <div className="text-[9px] text-gray-400">
          0 posts · 0 likes
        </div>
      </div>
      <div className="text-[11px] font-semibold text-gray-400">
        0 pts
      </div>
    </div>
  );

  // 🚀 ZOPTYMALIZOWANA renderUserList - activeUsers już zawiera tylko aktualną stronę
  const renderUserList = () => {
    if (isLoadingUsers) {
      return [...Array(10)].map((_, index) => renderEmptyItem(((currentPage - 1) * 10) + index));
    }

    // 🚀 OPTYMALIZACJA: Nie używaj slice() - activeUsers już zawiera tylko aktualną stronę
    const usersToDisplay = activeUsers;
    
    // Wypełnij pozostałe miejsca pustymi elementami
    const items = [...Array(10)].map((_, index) => {
      const user = usersToDisplay[index];
      if (user) {
        return renderUserItem(user, ((currentPage - 1) * 10) + index); // Popraw indeks dla numeracji
      }
      return renderEmptyItem(((currentPage - 1) * 10) + index);
    });

    return items;
  };
        
  // Funkcja renderująca pojedynczy element listy użytkowników
  const renderUserItem = (user: any, index: number) => {
    // Special case for vitalik.eth
    const isVitalik = userNames[user.address]?.name === 'vitalik.eth';
    // Add 5000 points for display if it's vitalik.eth
    const displayPoints = isVitalik ? 5000 : user.points;
    // Sprawdź, czy numer pozycji ma dwie lub więcej cyfr
    const hasLargeRankNumber = (index + 1) >= 10;
    
    return (
    <div key={user.address} className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all duration-300">
      <div className={`${hasLargeRankNumber ? 'w-8' : 'w-6'} flex-shrink-0`}>
        <span className={`text-[11px] font-bold ${
          index === 0 ? 'text-yellow-500' :
          index === 1 ? 'text-gray-400' :
          index === 2 ? 'text-amber-600' :
          'text-gray-500'
        }`}>
          #{index + 1}
        </span>
      </div>
      <div className="w-8 h-8 flex-shrink-0">
        {userNames[user.address]?.avatar ? (
          <img
            src={userNames[user.address].avatar}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <Avatar address={toEthereumAddress(user.address)} className="w-8 h-8 rounded-full" />
        )}
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center">
          <span className={`text-[11px] font-medium truncate ${
            isVitalik
              ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-transparent bg-clip-text font-bold'
              : userNames[user.address]?.name?.includes('.base.eth') 
                ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text' 
                : 'text-gray-900 dark:text-white'
          }`}>
            <span>
          {userNames[user.address]?.name?.endsWith('.sphere') ? (
            <>
              <span>{userNames[user.address].name.replace('.sphere', '')}</span>
              <span className="text-blue-500">.sphere</span>
            </>
                     ) : userNames[user.address]?.name?.endsWith('.camper') ? (
             <>
               <span>{userNames[user.address].name.replace('.camper', '')}</span>
               <span className="text-orange-500">.camper🏕️</span>
             </>
           ) : userNames[user.address]?.name?.endsWith('.celo') ? (
             <>
               <span>{userNames[user.address].name.replace('.celo', '')}</span>
               <span className="!text-yellow-500">.celo</span>
             </>
           ) : userNames[user.address]?.name?.endsWith('.world') ? (
             <>
               <span>{userNames[user.address].name.replace('.world', '')}</span>
               <span className="text-green-500">.world</span>
             </>
           ) : (
            userNames[user.address]?.name || user.address.slice(0, 6) + '...' + user.address.slice(-4)
          )}
        </span>
          </span>
          
          {/* Display Ethereum Founder badge for vitalik.eth */}
          {isVitalik && (
            <span className="inline-flex items-center px-2 py-0.5 ml-2 text-[9px] font-medium rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-white">
              <img 
                src="/ethlogo.png" 
                alt="ETH" 
                className="w-3 h-3 mr-1"
              />
              ETH Founder
            </span>
          )}
        </div>
        <div className="text-[9px] text-gray-500">
          {displayPoints.toLocaleString()} pts
        </div>
      </div>
      {/* Bylo <div> z onTouchStart ORAZ onClick - na dotyku odpalaly sie oba,
          wiec profil ladowal sie dwa razy (dwa odczyty z Firestore i dwa
          ustawienia stanu na jedno tkniecie). Zostal sam onClick, ktory
          przegladarka wywoluje takze po dotknieciu, a <button> daje focus
          i obsluge klawiatury za darmo. */}
      <button
        type="button"
        onClick={() => handleViewBuilderProfile(user.address)}
        aria-label={`View profile of ${userNames[user.address]?.name || user.address}`}
        className="text-[11px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors cursor-pointer"
      >
        View
      </button>
    </div>
  )};



  // Drugi efekt ustawiajacy isMounted zostal usuniety - robil dokladnie to samo,
  // co ten przy loadInitialData, tyle ze z zaleznoscia [isMounted], czyli sam
  // wyzwalal wlasne ponowne uruchomienie.

  // Wykrywanie urządzeń Apple i naprawianie vh
  useEffect(() => {
    // Wykrywanie urządzeń Apple
    const userAgent = navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|macintosh|mac os x/.test(userAgent) && !('MSStream' in window);
    setIsAppleDevice(isApple);
    
    /**
     * ===== DLACZEGO --vh NIE IDZIE ZA KAZDYM `resize` =====
     *
     * Feed zacinal sie przy przewijaniu w aplikacji mobilnej i to bylo zrodlo.
     *
     * Na telefonie pasek adresu chowa sie i wraca W TRAKCIE przewijania, a
     * kazde takie drgniecie to zdarzenie `resize`. Poprzednia wersja pisala
     * przy kazdym z nich `--vh` na <html>. Zmienne CSS SA DZIEDZICZONE, wiec
     * zapis na korzeniu uniewaznia style KAZDEGO elementu w dokumencie -
     * przy dlugim feedzie to pelne przeliczenie stylow na klatke przewijania.
     * W webview miniappki boli to najbardziej, bo ta warstwa i tak zmienia
     * wysokosc czesciej niz zwykla przegladarka.
     *
     * Gorsze: to bylo sprzeczne z samym celem tej sztuczki. `--vh` istnieje po
     * to, zeby uklad mial STALA wysokosc odniesienia i NIE skakal, gdy pasek
     * adresu znika. Przeliczanie go przy kazdej zmianie wysokosci sprawialo, ze
     * uklad skakal dokladnie wtedy, kiedy mial nie skakac.
     *
     * Teraz liczymy tylko wtedy, gdy zmienila sie SZEROKOSC (obrot ekranu,
     * zmiana okna). Zmiana samej wysokosci to pasek adresu i ma byc zignorowana.
     * Zapis jest dodatkowo pomijany, gdy wartosc wychodzi ta sama, i wpuszczony
     * w `requestAnimationFrame`, zeby nigdy nie liczyc dwa razy w jednej klatce.
     */
    let ostatniaSzerokosc = window.innerWidth;
    let ostatnieVh = '';
    let ramka = 0;

    const setVh = () => {
      const vh = `${window.innerHeight * 0.01}px`;
      if (vh === ostatnieVh) return; // ten sam wynik - zapis nic nie zmieni, a kosztuje przeliczenie
      ostatnieVh = vh;
      document.documentElement.style.setProperty('--vh', vh);
    };

    const onResize = () => {
      // Sama wysokosc = pasek adresu. Nie ruszamy niczego.
      if (window.innerWidth === ostatniaSzerokosc) return;
      ostatniaSzerokosc = window.innerWidth;
      if (ramka) cancelAnimationFrame(ramka);
      ramka = requestAnimationFrame(setVh);
    };

    // Obrot ekranu zmienia wysokosc RAZEM z szerokoscia, ale kolejnosc zdarzen
    // bywa odwrotna - stad osobny nasluch, ktory liczy bezwarunkowo.
    const onOrientation = () => {
      ostatniaSzerokosc = window.innerWidth;
      if (ramka) cancelAnimationFrame(ramka);
      ramka = requestAnimationFrame(setVh);
    };

    setVh();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    
    // Dodanie styli CSS dla urządzeń Apple
    if (isApple) {
      const styleElement = document.createElement('style');
      styleElement.innerHTML = `
        .modal-open {
          overflow: hidden;
          position: fixed;
          width: 100%;
          height: 100%;
        }
        .apple-touch-scroll {
          -webkit-overflow-scrolling: touch;
        }
        .apple-performance {
          will-change: transform;
          transform: translateZ(0);
        }
        .full-height {
          height: calc(var(--vh, 1vh) * 100);
        }
        .reduce-animation {
          animation-duration: 0.5s !important;
          transition-duration: 0.3s !important;
        }
      `;
      document.head.appendChild(styleElement);
    }
    
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      if (ramka) cancelAnimationFrame(ramka);
    };
  }, []);

  // Blokowanie przewijania gdy modal jest otwarty
  useEffect(() => {
    if (showShareModal || showPostDialog || showSettingsModal || showProfileModal || showGroupModal || showPostImagePreview) {
      document.body.classList.add('modal-open');
      
      // Dodatkowa obsługa dla iOS aby zapobiec przewijaniu w tle
      if (isAppleDevice) {
        const preventScroll = (e: TouchEvent) => {
          if (e.target && e.target instanceof Element && !e.target.closest('.apple-touch-scroll')) {
            e.preventDefault();
          }
        };
        document.addEventListener('touchmove', preventScroll, { passive: false });
        return () => {
          document.removeEventListener('touchmove', preventScroll);
          document.body.classList.remove('modal-open');
        };
      }
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [showShareModal, showPostDialog, showSettingsModal, showProfileModal, showGroupModal, showPostImagePreview, isAppleDevice]);

  // handlePinPending musi byc PRZED tym wczesnym returnem - to hook (useCallback),
  // a hooki za warunkowym returnem lamia kolejnosc wywolan Reacta
  // ("Rendered more hooks than during the previous render").
  const handlePinPending = useCallback((postId: string, txHash: string, duration: string) => {
    const expectedAt = Date.now() + (5 * 60 * 1000); // Expected confirmation in 5 minutes
    
    setPendingPins(prev => ({
      ...prev,
      [postId]: {
        txHash,
        duration,
        expectedAt
      }
    }));
    
    console.log(`⏳ BaseChat: Post ${postId} set to pending pin state`, { txHash, duration, expectedAt });
  }, []);

  // Jeśli komponent nie jest zamontowany, zwracamy pusty div
  if (!isMounted) {
    return <div></div>;
  }

  // Funkcja do ładowania profilu użytkownika i przełączenia panelu
  const handleViewBuilderProfile = async (userAddress: string) => {
    if (!userAddress) return;
    
    try {
      // Pobierz profil z Firebase
      const profile = await fetchUserProfile(userAddress, { loadSocialLinks: true });
      
      if (profile) {
        // Pobierz baseChatPoints z Firebase
        const userRef = doc(db, 'users', userAddress);
        const userDoc = await getDoc(userRef);
        const baseChatPoints = userDoc.exists() ? (userDoc.data().baseChatPoints || {}) : {};
        
        // Ustaw wybrany profil
        setSelectedBuilderProfile({
          address: userAddress,
          name: userNames[userAddress]?.name || profile.name || `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
          avatar: userNames[userAddress]?.avatar || profile.avatar,
          bio: profile.bio,
          postCount: profile.postsCount || 0,
          likesReceived: profile.likesReceived || 0,
          socialLinks: profile.socialLinks,
          baseChatPoints: {
            postPoints: baseChatPoints.postPoints || 0,
            likePoints: baseChatPoints.likePoints || 0,
            activityBonus: baseChatPoints.activityBonus || 0,
            baseNameBonus: baseChatPoints.baseNameBonus || 0,
            sphereBonus: baseChatPoints.sphereBonus || 0,
            camperBonus: baseChatPoints.camperBonus || 0,
            celoBonus: baseChatPoints.celoBonus || 0,
            worldBonus: baseChatPoints.worldBonus || 0,
            referralPoints: baseChatPoints.referralPoints || 0,
            totalPoints: baseChatPoints.totalPoints || 0
          }
        });
        
        // Przełącz panel
        setActiveMainPanel('builders');
        
        // Na telefonach, ustaw główny widok na środkowy panel i przełącz z Trends na główny panel
        if (window.innerWidth < 1024) {
          // Przełącz na główny panel
          setActiveMobilePanel('main');
          
          // Automatyczne przewijanie do widoku builder profile
          setTimeout(() => {
            const builderSection = document.querySelector('.builder-profile-container');
            if (builderSection) {
              builderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error loading builder profile:', error);
    }
  };

  // Funkcja do powrotu do panelu feed
  const handleBackToFeed = () => {
    setActiveMainPanel('feed');
    setSelectedBuilderProfile(null);
    // Resetowanie tooltipów
    setHoveredUser(null);
  };

  // Na początku pliku po inicjalizacji wszystkich stanów, dodajmy funkcję refreshPosts i zmienną today
  const today = new Date().toISOString().split('T')[0];

  // handlePinConfirmed() usuniete jako martwe - nic go nie wywolywalo, wiec wpis
  // w `pendingPins` nie byl kasowany po potwierdzeniu przypiecia z tego miejsca.
  // Czysci go PostList, ktory jako jedyny dostaje `pendingPins` i `onPinPending`.

  // Funkcja do odświeżania postów
  const refreshPosts = async () => {
    if (onRefreshPosts) {
      await onRefreshPosts();
    }
  };

  return (
    <>
      {/* Contract Event Listener - listens for PinCreated events and refreshes feed */}


      <BanPage>
        <Script src="https://widgets.coingecko.com/gecko-coin-price-marquee-widget.js" />
        
        {/* Komunikat powitalny dla użytkowników z linku referalowego */}
        {showWelcomeMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-2xl"
          >
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-lg">Welcome to BaseChat! 🎉</p>
                <p className="text-sm opacity-90">Your sign-up through the referral link went through</p>
              </div>
            </div>
          </motion.div>
        )}
        
        <div className="min-h-screen relative">
          {/* ===== TLO STRONY - kierunek Soft Social =====
              Bylo tu prawie czarne #050B20 z gradientem. Na telefonie feed
              chodzil juz na jasnym `bg-soft-bg` (klasa max-lg: nizej), wiec ta
              sama aplikacja miala dwa rozne swiaty w zaleznosci od szerokosci
              ekranu - a na desktopie biale karty swiecily na czerni jak
              prostokaty podswietlone od tylu. Jedno tlo na obu szerokosciach.
              Ekran powitalny (SoftSignInHero) byl juz jasny, wiec dopiero
              teraz reszta strony do niego pasuje. */}
          <div className="fixed inset-0 bg-soft-bg z-0" />

          {/* Dodajemy klasę reduce-animation do elementów z animacjami dla urządzeń Apple */}
          <div className={`relative z-10 ${isAppleDevice ? 'reduce-animation' : ''}`}>
            {/* Widgets */}
            <div className="w-full space-y-1">
              <div className="w-full bg-soft-surface border-b border-soft-line py-1">
                <gecko-coin-price-marquee-widget
                  locale="en"
                  outlined="true"
                  coin-ids="bitcoin,ethereum,binancecoin,ripple,cardano,solana,polkadot,dogecoin"
                  initial-currency="usd"
                />
              </div>
              {/* Second marquee disabled
              <div className="w-full bg-white/[.02] backdrop-blur-sm py-1">
                <gecko-coin-price-marquee-widget 
                  locale="en" 
                  outlined="true"
                  coin-ids="official-trump,american-coin,maga,ondo-finance,fartcoin,department-of-government-efficiency,ai16z,dogelon-mars,jupiter-exchange-solana,dogecoin,griffain,virtual-protocol,aixbt" 
                  initial-currency="usd"
                />
              </div>
              */}
            </div>

            {/* ===== UKLAD DESKTOP: DWIE KOLUMNY, NIE TRZY =====
                Bylo: panel lewy 380px | feed | panel prawy 380px.

                Prawa kolumna nie miala CO pokazywac na desktopie: jedyny
                komponent w niej, SoftTrendsPanel, byl `lg:hidden`, "Global
                Statistics" i "Trending Hashtags" zniknely w poprzednim kroku,
                a kafelek YapScan chowa sie sam, bo /yapscan jest wylaczone
                w config/routeStatus.js. Zostawalo 380px bialej pustki
                dosunietej do prawej krawedzi - i zaden desktopowy uzytkownik
                nie widzial juz ZADNYCH statystyk. `lg:hidden` z Trends poszlo
                (patrz SoftTrendsPanel), a panel wrocil - w tej kolumnie.

                Teraz jedna kolumna boczna trzyma wszystko, co nie jest feedem
                (nawigacja, profil, Trends, ranking polecen), a feed dostaje
                cala reszte szerokosci i wlasna miare czytania. Zawartosc
                obu paneli zmiescila sie w jednej bez straty - nic nie
                wypadlo, patrz komentarze przy przeniesionych blokach.

                NA TELEFONIE NIC SIE NIE ZMIENIA W NAWIGACJI: trzy zakladki na
                dole dalej prowadza do trzech osobnych ekranow. Ten sam
                kontener obsluguje teraz dwie z nich ('left' i 'right'), a o
                tym, ktora tresc widac, decyduja dwa opakowania nizej. */}
            <div className="flex h-screen overflow-hidden">
              {/* Kolumna boczna: nawigacja + profil + Trends */}
              <div className={`${
                activeMobilePanel === 'left' || activeMobilePanel === 'right'
                  ? 'fixed inset-0 z-30 pt-[120px] pb-24'
                  : 'hidden'
              } ${
                /* Niezalogowany desktop: kolumna schodzi z drogi i cala szerokosc
                   bierze kolumna glowna - a tam stoi teraz ekran powitalny NAD
                   feedem, nie zamiast niego. Kolumna boczna bez portfela ma do
                   pokazania wylacznie kartke-zaslepke ("MySphere User",
                   0x0000...0000, awatar-duch), wiec jej powrot niczego by nie
                   dolozyl. Na telefonie zostaje - stamtad prowadza do niej
                   zakladki na dole. */
                isConnected ? 'lg:block' : 'lg:hidden'
              } lg:relative lg:w-[352px] xl:w-[380px] lg:flex-none lg:pt-6 lg:pb-24 lg:border-r lg:border-soft-line bg-soft-bg overflow-y-auto p-4 lg:px-5 mobile-scroll-container`}
                                 style={{
                   WebkitOverflowScrolling: 'touch',
                   overscrollBehavior: 'contain'
                 }}
               >
                 {/* Invisible scroll trigger areas for mobile */}
                 <div className="lg:hidden pointer-events-none absolute inset-0 z-0">
                   <div className="absolute left-0 top-0 w-8 h-full pointer-events-auto" 
                        style={{ touchAction: 'pan-y' }}></div>
                   <div className="absolute right-0 top-0 w-8 h-full pointer-events-auto"
                        style={{ touchAction: 'pan-y' }}></div>
                 </div>

              {/* ===== PROFIL I NAWIGACJA =====
                  Na telefonie to zawartosc zakladki "Profile". Na desktopie -
                  gorna czesc jedynej kolumny bocznej. Opakowanie chowa ja
                  tylko wtedy, gdy telefon stoi na zakladce "Trends". */}
              <div className={activeMobilePanel === 'right' ? 'hidden lg:block' : ''}>

                {/* ===== NAWIGACJA NA DESKTOPIE =====
                    Te szesc pozycji stalo dotad NAD FEEDEM jako siatka
                    <GlassIcons/>. Handlery sa przeniesione JEDEN DO JEDNEGO,
                    razem z warunkiem `isConnected` i z galezia `address ? ...`,
                    ktora dokladala trzy ostatnie pozycje tylko po podlaczeniu
                    portfela.

                    Dlaczego inna oprawa, skoro zasada brzmi "przemalowac, nie
                    podmieniac": GlassIcons rysuje sie w siatce `lg:grid-cols-6`
                    i zaklada CIEMNE tlo (kafle `bg-white/10`, tekst
                    `text-gray-700`, aktywny gradient niebiesko-fioletowy).
                    W kolumnie 352px to sie nie miesci, a na jasnym tle aktywny
                    kafel schodzi ponizej czytelnego kontrastu. Zamiast tego
                    ta sama lista, ktora telefon ma juz dzis - jedna nawigacja
                    na obu szerokosciach zamiast dwoch roznych.

                    NIC NIE UBYLO: szesc akcji = szesc akcji, ta sama tresc
                    etykiet, to samo `isActive`. */}
                {isConnected && (
                  <SoftSectionList
                    className="mb-6 hidden lg:flex"
                    ariaLabel="Browse"
                    variant="compact"
                    sections={[
                      {
                        id: 'desktop-feed',
                        label: 'All Posts',
                        description: 'Everything, newest first',
                        icon: <LayoutGrid className="w-5 h-5" />,
                        isActive: activeMainPanel === 'feed',
                        onSelect: () => {
                          setSelectedTag('');
                          setSelectedAuthor('');
                          setActiveMainPanel('feed');
                          clearViewParams();
                        },
                      },
                      {
                        id: 'desktop-profile',
                        label: 'My Profile',
                        description: 'Your builder profile',
                        icon: <UserCircle className="w-5 h-5" />,
                        isActive: activeMainPanel === 'builders',
                        onSelect: () => {
                          if (address) {
                            handleViewBuilderProfile(address);
                            clearViewParams();
                          } else {
                            toast.error('Connect your wallet to view builder profiles');
                          }
                        },
                      },
                      {
                        id: 'desktop-myfeed',
                        label: showMyFeed ? 'All Posts' : 'My Feed',
                        description: 'Only your own posts',
                        icon: <Rss className="w-5 h-5" />,
                        isActive: showMyFeed,
                        onSelect: () => {
                          setShowMyFeed(!showMyFeed);
                          clearViewParams();
                          if (isConnected && address) {
                            const loadPosts = async () => {
                              try {
                                setIsLoadingPosts(true);
                                const { posts: fetchedPosts } = await fetchPosts({
                                  userId: address,
                                  ...(!showMyFeed ? { authorFilter: address } : {})
                                });
                                setPosts(fetchedPosts);
                              } catch (error) {
                                console.error('Error fetching posts:', error);
                              } finally {
                                setIsLoadingPosts(false);
                              }
                            };
                            loadPosts();
                          }
                        },
                      },
                      ...(address ? [
                        {
                          id: 'desktop-following',
                          label: 'Follows',
                          description: 'Only people you follow',
                          icon: <Eye className="w-5 h-5" />,
                          isActive: activeMainPanel === 'following',
                          onSelect: () => {
                            setActiveMainPanel('following');
                            clearViewParams();
                          },
                        },
                        {
                          id: 'desktop-friends',
                          label: 'Friends',
                          description: 'People you both follow',
                          icon: <Users className="w-5 h-5" />,
                          isActive: activeMainPanel === 'friends',
                          onSelect: () => {
                            setActiveMainPanel('friends');
                            clearViewParams();
                          },
                        },
                        {
                          id: 'desktop-discover',
                          label: 'Discover',
                          description: 'Find people to follow',
                          icon: <Compass className="w-5 h-5" />,
                          isActive: activeMainPanel === 'discover',
                          onSelect: () => {
                            setActiveMainPanel('discover');
                            clearViewParams();
                          },
                        }
                      ] : [])
                    ]}
                  />
                )}

                <div className="mb-8">
                  {isConnected ? (
                    <div className="space-y-4">
                      {/* ===== PRZELACZNIK WIDOKOW - TYLKO NA TELEFONIE =====
                          "My Profile / Follows / Friends / Discover" siedzialy
                          dotad na gorze glownego feedu, jako rzad kolorowych
                          kafli. Zabieraly pierwszy ekran telefonu i konkurowaly
                          z trescia, po ktora ludzie tu przychodza - a cztery
                          z pieciu pozycji to wcale nie jest feed, tylko osobne
                          widoki.

                          Tak samo rozwiazuje to Twitter: os czasu jest sama,
                          a wszystko "moje" siedzi za profilem.

                          Na desktopie nic sie nie zmienia - tam jest miejsce
                          w bok i rzad kafli nikomu nie przeszkadza. */}
                      <SoftSectionList
                        className="mb-4 lg:hidden"
                        sections={[
                          {
                            id: 'feed',
                            label: 'All Posts',
                            description: 'Everything, newest first',
                            icon: <LayoutGrid className="w-5 h-5" />,
                            isActive: activeMainPanel === 'feed',
                            onSelect: () => {
                              setSelectedTag('');
                              setSelectedAuthor('');
                              setActiveMainPanel('feed');
                              clearViewParams();
                              setActiveMobilePanel('main');
                            },
                          },
                          {
                            id: 'following',
                            label: 'Follows',
                            description: 'Only people you follow',
                            // Ikony sa teraz TAKIE SAME jak w liscie desktopowej
                            // nizej. Wczesniej Rss oznaczalo tu "Follows",
                            // a na desktopie "My Feed" - ten sam znak dwie
                            // rozne rzeczy, w zaleznosci od szerokosci ekranu.
                            icon: <Eye className="w-5 h-5" />,
                            isActive: activeMainPanel === 'following',
                            onSelect: () => {
                              setActiveMainPanel('following');
                              setActiveMobilePanel('main');
                            },
                          },
                          {
                            id: 'friends',
                            label: 'Friends',
                            description: 'People you both follow',
                            icon: <Users className="w-5 h-5" />,
                            isActive: activeMainPanel === 'friends',
                            onSelect: () => {
                              setActiveMainPanel('friends');
                              setActiveMobilePanel('main');
                            },
                          },
                          {
                            id: 'discover',
                            label: 'Discover',
                            description: 'Find people to follow',
                            icon: <Compass className="w-5 h-5" />,
                            isActive: activeMainPanel === 'discover',
                            onSelect: () => {
                              setActiveMainPanel('discover');
                              setActiveMobilePanel('main');
                            },
                          },
                        ]}
                      />

                      {/* ===== NAGLOWEK PROFILU NA TELEFONIE - Soft Social =====
                          Ten sam motyw, co ekran startowy: fioletowy gradient
                          i znak marki na okregu. Tozsamosc produktu wraca w tym
                          samym miejscu, wiec profil czyta sie jak jego czesc,
                          a nie jak osobny ekran.

                          ProfileCard ponizej zostaje NIETKNIETY i widoczny od
                          progu `lg` w gore - cala jego logika (tilt, edycja,
                          linki spolecznosciowe) dziala dalej bez zmian. */}
                      {address && (
                        <SoftProfileHeader
                          name={userProfile.name || 'MySphere User'}
                          address={address}
                          avatarUrl={userProfile.avatar}
                          posts={userProfile.postCount || 0}
                          likes={userProfile.likesReceived || 0}
                          // Punkty licza sie z aktywnosci i zyja w userStats
                          // pod adresem uzytkownika, nie w profilu.
                          points={(address && userStats[address]?.totalPoints) || 0}
                          onCopyAddress={() => {
                            navigator.clipboard.writeText(address);
                            toast.success('Address copied');
                          }}
                          onEdit={() => setIsEditingProfile(!isEditingProfile)}
                        />
                      )}

                      {/* ===== PANEL EDYCJI STOI TAM, GDZIE PRZYCISK, KTORY GO OTWIERA =====
                          Byl 340 linii nizej - POD obiema kartami profilu. Na
                          telefonie znaczylo to: dotykasz "Edit" na gorze, nic
                          widocznego sie nie dzieje, a formularz otwiera sie poza
                          ekranem. Zgloszenie brzmialo "pokazuje sie dopiero pod
                          karta" i bylo trafne co do joty.

                          Reakcja na dotkniecie ma byc widoczna w tym samym kadrze,
                          w ktorym nastapilo dotkniecie. Teraz panel wychodzi
                          bezposrednio spod naglowka z tym przyciskiem, na obu
                          szerokosciach. */}
                      {isEditingProfile && address && (
                        <div className="mb-3 relative">
                          <div className="bg-gradient-to-br from-blue-50/80 via-white/50 to-purple-50/80 dark:from-blue-900/20 dark:via-gray-800/40 dark:to-purple-900/20 backdrop-blur-xl rounded-xl border border-blue-200/50 dark:border-blue-700/30 p-4 shadow-xl">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                    Edit Profile
                                  </h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Customize your MySphere identity</p>
                                </div>
                              </div>
                              <button
                                onClick={() => setIsEditingProfile(false)}
                                className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                              >
                                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {/* Profile Picture Section */}
                            {/* Profile Section - Grid Layout */}
                            <div className="mb-4 grid grid-cols-2 gap-3">
                              {/* Profile Picture */}
                              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                  <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>Profile Picture</span>
                                </label>
                                <div className="flex flex-col items-center space-y-2">
                                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-blue-200 dark:border-blue-700">
                                    {userProfile.avatar ? (
                                      <img
                                        src={userProfile.avatar}
                                        alt="Current profile"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 to-purple-900 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        if (!e.target.files || !e.target.files[0] || !address) return;
                                        
                                        const file = e.target.files[0];
                                        const isAdmin = address.toLowerCase() === ADMIN_ADDRESS;
                                        
                                        if (!isAdmin && file.size > 3 * 1024 * 1024) {
                                          alert('Maximum file size is 3MB');
                                          return;
                                        }

                                        // Sprawdź ograniczenia czasowe tylko dla zwykłych użytkowników
                                        if (!isAdmin) {
                                        const userRef = doc(db, 'users', address);
                                        const userDoc = await getDoc(userRef);
                                        const userData = userDoc.data();

                                        if (userData?.lastImageUpdate) {
                                          const lastUpdate = userData.lastImageUpdate.toDate();
                                          const oneMonthAgo = new Date();
                                          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                                          
                                          if (lastUpdate > oneMonthAgo) {
                                            const timeToWait = new Date(lastUpdate.getTime() + 30 * 24 * 60 * 60 * 1000);
                                            const now = new Date();
                                            const diff = timeToWait.getTime() - now.getTime();
                                            
                                            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                            
                                            alert(`You can change your profile picture once a month.\nTime remaining: ${days} days and ${hours} hours`);
                                            return;
                                            }
                                          }
                                        }

                                        setSelectedFile(file);
                                        const maxSizeText = isAdmin ? 'No file size limit for admin' : 'Maximum file size: 3MB';
                                        const timeRestrictionText = isAdmin ? 'Admin can change anytime.' : 'Next change will be possible in one month.';
                                        setModalMessage(`Are you sure you want to change your profile picture?\n${timeRestrictionText}\n${maxSizeText}`);
                                        setModalType('confirm');
                                        setShowModal(true);
                                      }}
                                      className="hidden"
                                      id="profile-picture-input"
                                    />
                                    <label
                                      htmlFor="profile-picture-input"
                                      className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all cursor-pointer text-xs font-medium shadow-md"
                                    >
                                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                      </svg>
                                      Upload
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Max 3MB
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Upgrade Your Card */}
                              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                  <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                  </svg>
                                  <span>Card Upgrade</span>
                                </label>
                                <div className="flex flex-col items-center space-y-2">
                                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-orange-200 dark:border-orange-700 bg-gradient-to-br from-orange-100 to-yellow-100 dark:from-orange-900 dark:to-yellow-900 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                    </svg>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <div className="relative group">
                                      <button
                                        className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg hover:from-orange-600 hover:to-yellow-600 transition-all cursor-pointer text-xs font-medium shadow-md opacity-75 cursor-not-allowed"
                                        disabled
                                      >
                                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                        Upgrade Your Card
                                      </button>
                                      {/* Tooltip */}
                                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                        soon
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                                      Premium features
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Username Section - only if no baseName */}
                            {!baseName && (
                              <div className="mb-4">
                                <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                    <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span>Username</span>
                                  </label>
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="Enter username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                      <div className="flex items-center space-x-2">
                                        <span className="text-gray-500 text-sm">Choose domain:</span>
                                        <select
                                          value={selectedSuffix}
                                          onChange={(e) => setSelectedSuffix(e.target.value as 'sphere' | 'camper' | 'celo' | 'world')}
                                          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                          <option value="sphere">.sphere (+1500 pts!)</option>
                                          <option value="camper">.camper (+1000 pts!)</option>
                                          <option value="celo">.celo (+1250 pts!)</option>
                                          <option value="world">.world (+1250 pts!)</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-2 border border-blue-200/30 dark:border-purple-700/30">
                                      <div className="text-center text-xs text-gray-600 dark:text-gray-400">
                                        Preview: <span className="font-medium text-gray-900 dark:text-white">{customName || 'username'}</span>.
                                        <span className={
                                          selectedSuffix === 'sphere' ? 'text-blue-500 font-medium' :
                                          selectedSuffix === 'camper' ? 'text-orange-500 font-medium' :
                                          selectedSuffix === 'celo' ? 'text-yellow-500 font-medium' :
                                          'text-green-500 font-medium'
                                        }>
                                          {selectedSuffix}
                                        </span>
                                        {selectedSuffix === 'sphere' && <span className="text-blue-600 ml-1">+1500 pts!</span>}
                                        {selectedSuffix === 'camper' && <span className="text-orange-600 ml-1">🏕️ +1000 pts!</span>}
                                        {selectedSuffix === 'celo' && <span className="text-yellow-600 ml-1">+1250 pts!</span>}
                                        {selectedSuffix === 'world' && <span className="text-green-600 ml-1">+1250 pts!</span>}
                                      </div>
                                    </div>
                                    <button
                                      onClick={handleSaveCustomName}
                                      className="w-full px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium text-xs"
                                    >
                                      Save Username
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Social Links Section */}
                            <div className="mb-4">
                              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                  <svg className="w-3 h-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                  </svg>
                                  <span>Social Links</span>
                                </label>
                                <div className="space-y-2">
                                  {/* Twitter */}
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg flex items-center justify-center">
                                      <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                      </svg>
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">X (Twitter)</label>
                                      <input
                                        type="text"
                                        value={userProfile.socialLinks?.twitter || ''}
                                        onChange={(e) => setUserProfile(prev => ({
                                          ...prev,
                                          socialLinks: {
                                            ...prev.socialLinks,
                                            twitter: e.target.value
                                          }
                                        }))}
                                        placeholder="username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>

                                  {/* Farcaster */}
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg flex items-center justify-center">
                                      <img src="/icon.png" alt="Farcaster" className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Farcaster/Warpcast</label>
                                      <input
                                        type="text"
                                        value={userProfile.socialLinks?.farcaster || ''}
                                        onChange={(e) => setUserProfile(prev => ({
                                          ...prev,
                                          socialLinks: {
                                            ...prev.socialLinks,
                                            farcaster: e.target.value
                                          }
                                        }))}
                                        placeholder="username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>

                                  {/* Discord */}
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                      <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                                      </svg>
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Discord</label>
                                      <input
                                        type="text"
                                        value={userProfile.socialLinks?.discord || ''}
                                        onChange={(e) => setUserProfile(prev => ({
                                          ...prev,
                                          socialLinks: {
                                            ...prev.socialLinks,
                                            discord: e.target.value
                                          }
                                        }))}
                                        placeholder="username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>

                                  <button
                                    onClick={async () => {
                                      if (!address) return;
                                      
                                      try {
                                        const userRef = doc(db, 'users', address);
                                        await updateDoc(userRef, {
                                          socialLinks: userProfile.socialLinks || {},
                                          lastUpdated: serverTimestamp()
                                        });
                                        
                                        alert('Social links saved!');
                                      } catch (error) {
                                        console.error('Error saving social links:', error);
                                        alert('Error saving social links. Please try again.');
                                      }
                                    }}
                                    className="w-full px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium text-xs"
                                  >
                                    Save Social Links
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setIsEditingProfile(false)}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium text-xs flex items-center justify-center space-x-1"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Done</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ProfileCard at the top */}
                      {address && (
                        <div className="mb-4 lg:mb-4 -mt-8 lg:mt-0">
                                                      <div className="relative z-10 flex justify-center items-start w-full">
                              <ProfileCard
                                name={userProfile.name || 'MySphere User'}
                                handle={userProfile.name?.replace('.sphere', '').replace('.camper', '').replace('.celo', '').replace('.world', '') || address.slice(0, 6) + '...' + address.slice(-4)}
                                status={address.slice(0, 6) + '...' + address.slice(-4)}
                                fullAddress={address}
                                contactText="Edit"
                                avatarUrl={userProfile.avatar || `/favicon_io (1)/android-chrome-192x1921.png`}
                                miniAvatarUrl={userProfile.avatar}
                                socialLinks={userProfile.socialLinks}
                                showUserInfo={true}
                                enableTilt={true}
                                onContactClick={() => {
                                  setIsEditingProfile(!isEditingProfile);
                                }}
                                className="w-full max-w-sm"
                              />
                            </div>
                        </div>
                      )}



                      {/* Modern Edit Profile Panel */}





                      {/* YapYap Integration - moved outside About Me */}
                      {address && (
                        <div className="mb-4">
                          <div className="rounded-card bg-soft-surface p-4 shadow-card">
                            <YapsMetrics address={address} />
                            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-center">
                              <div className="flex items-center">
                                <div className="text-xs text-gray-400 mr-1">Powered by</div>
                                <div className="text-xs font-medium text-blue-600 flex items-center">
                                  <svg className="w-4 h-4 mx-1" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="12" r="10" fill="currentColor" />
                                    <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                  </svg>
                                  Kaito.ai
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bio. Naglowek byl tekstem z gradientem (bg-clip-text)
                          i ikona-dekoracja obok - jedno i drugie to sygnal
                          "wygenerowane", a nie hierarchia. Teraz zwykly
                          naglowek w kroju naglowkowym. */}
                      <div className="mt-4 rounded-card bg-soft-surface p-4 shadow-card">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-soft-display text-[15px] font-bold text-soft-ink">About Me</h3>
                          <button
                            onClick={async () => {
                              if (!address) return;
                              
                              // Sprawdź ostatnią edycję bio
                              const userRef = doc(db, 'users', address);
                              const userDoc = await getDoc(userRef);
                              const lastBioUpdate = userDoc.data()?.lastBioUpdate?.toDate() || new Date(0);
                              const now = new Date();
                              
                              // Sprawdź czy minęło 24h od ostatniej edycji
                              if (now.getTime() - lastBioUpdate.getTime() < 24 * 60 * 60 * 1000) {
                                const nextUpdate = new Date(lastBioUpdate.getTime() + 24 * 60 * 60 * 1000);
                                const hoursLeft = Math.ceil((nextUpdate.getTime() - now.getTime()) / (1000 * 60 * 60));
                                alert(`You can edit your bio once per day. ${hoursLeft} hours remaining.`);
                                return;
                              }

                              const newBio = prompt('Enter your bio (max 90 characters):', userProfile.bio);
                              if (newBio && newBio.length <= 90) {
                                await updateDoc(userRef, { 
                                  bio: newBio,
                                  lastBioUpdate: serverTimestamp()
                                });
                                setUserProfile(prev => ({ ...prev, bio: newBio }));
                              }
                            }}
                            className="flex items-center space-x-1 rounded-pill px-2 py-1 font-soft text-[13px] font-semibold text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit</span>
                          </button>
                        </div>
                        <div className="rounded-[14px] bg-soft-sunken p-4">
                          <div className="font-soft text-[13.5px] leading-relaxed text-soft-ink-muted">
                            {userProfile.bio ||
                              <span className="text-soft-ink-soft">Nothing here yet - use Edit to add your bio.</span>
                            }
                          </div>
                        </div>
                      </div>

                      {/* Base Tracking Identity Link.
                          UWAGA: /base jest teraz wylaczone (config/routeStatus.js).
                          Poprzednio kafelek wskazywal na /profile - trase, ktora
                          NIGDY nie istniala w tym repo (brak app/profile), wiec
                          byl to martwy link zwracajacy 404. */}
                      <div className={`mt-4 ${isRouteDisabled('/base') ? 'hidden' : ''}`}>
                        <a
                          href="/base"
                          className="block w-full p-6 bg-gradient-to-r from-gray-900 via-blue-900 to-black rounded-xl text-center hover:from-black hover:via-blue-800 hover:to-gray-800 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        >
                          <div className="flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                            <div className="flex items-center">
                              <span className="text-white text-xl font-bold mr-2">Sphere Identity</span>
                              <div className="flex items-center gap-1 px-2 py-1 bg-white/10 rounded-full">
                                <svg className="w-4 h-4" viewBox="0 0 146 146" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <circle cx="73" cy="73" r="73" fill="#0052FF"/>
                                  <path d="M73.323 123.729C101.617 123.729 124.553 100.832 124.553 72.5875C124.553 44.343 101.617 21.4463 73.323 21.4463C46.4795 21.4463 24.4581 42.0558 22.271 68.2887H89.9859V76.8864H22.271C24.4581 103.119 46.4795 123.729 73.323 123.729Z" fill="white"/>
                                </svg>
                                <span className="text-white text-xs font-medium">Base</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-blue-200 text-sm mb-2">
                            View your complete on-chain identity & activity
                          </p>
                          <div className="flex items-center justify-center text-blue-300 text-xs">
                            <span>Transactions • Tokens • NFTs • Contracts</span>
                            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                        </a>
                      </div>

                      {/* Referral Leaderboard */}
                      <div className="mb-4">
                        <ReferralLeaderboard />
                      </div>
                  </div>
                ) : (
                  <div className="space-y-4 pointer-events-none">
                    {/* ProfileCard at the top */}
                    <div className="mb-4 lg:mb-4 -mt-8 lg:mt-0">
                      <div className="relative z-10 flex justify-center items-start w-full">
                        <ProfileCard
                          name={'MySphere User'}
                          handle={'mysphere-user'}
                          status={'0x0000...0000'}
                          fullAddress={'0x0000000000000000000000000000000000000000'}
                          contactText="Edit"
                          avatarUrl={`/ghostavatar.png`}
                          miniAvatarUrl={`/ghostavatar.png`}
                          socialLinks={{}}
                          showUserInfo={true}
                          enableTilt={true}
                          onContactClick={() => {}}
                          className="w-full max-w-sm"
                        />
                      </div>
                    </div>

                    {/* Referral Leaderboard */}
                    <div className="mb-4">
                      <ReferralLeaderboard />
                    </div>

                    {/* YapYap Integration */}
                    <div className="mb-4">
                      <div className="rounded-card bg-soft-surface p-4 shadow-card">
                        <YapsMetrics address={''} />
                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-center">
                          <div className="flex items-center">
                            <div className="text-xs text-gray-400 mr-1">Powered by</div>
                            <div className="text-xs font-medium text-blue-600 flex items-center">
                              <svg className="w-4 h-4 mx-1" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="10" fill="currentColor" />
                                <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                              Kaito.ai
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bio - widok bez podlaczonego portfela.
                        BYLO TU ZMYSLONE BIO ("Building the future of DeFi on
                        Base... Always learning, always building!") wpisane na
                        sztywno w kod. Widzial je kazdy niezalogowany gosc, przy
                        awatarze-duchu i adresie 0x0000...0000 - czyli produkt,
                        ktorego cala teza brzmi "te dane sa sprawdzalne",
                        otwieral sie wymyslonym cudzym zyciorysem.
                        Teraz honest empty state: nie ma danych, bo nie ma
                        jeszcze uzytkownika, i tak to pisze. */}
                    <div className="mt-4 rounded-card bg-soft-surface p-4 shadow-card">
                      <h3 className="mb-3 font-soft-display text-[15px] font-bold text-soft-ink">About Me</h3>
                      <div className="rounded-[14px] bg-soft-sunken p-4">
                        <p className="font-soft text-[13.5px] leading-relaxed text-soft-ink-soft">
                          Sign in to write your bio.
                        </p>
                      </div>
                    </div>

                    {/* Base Tracking Identity Link */}
                    <div className="mt-4">
                      <div className="block w-full p-6 bg-gradient-to-r from-gray-900 via-blue-900 to-black rounded-xl text-center hover:from-black hover:via-blue-800 hover:to-gray-800 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl">
                        <div className="flex items-center justify-center mb-3">
                          <svg className="w-8 h-8 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                          <div className="flex items-center">
                            <span className="text-white text-xl font-bold mr-2">Sphere Identity</span>
                            <div className="flex items-center gap-1 px-2 py-1 bg-white/10 rounded-full">
                              <svg className="w-4 h-4" viewBox="0 0 146 146" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="73" cy="73" r="73" fill="#0052FF"/>
                                <path d="M73.323 123.729C101.617 123.729 124.553 100.832 124.553 72.5875C124.553 44.343 101.617 21.4463 73.323 21.4463C46.4795 21.4463 24.4581 42.0558 22.271 68.2887H89.9859V76.8864H22.271C24.4581 103.119 46.4795 123.729 73.323 123.729Z" fill="white"/>
                              </svg>
                              <span className="text-white text-xs font-medium">Base</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-blue-200 text-sm mb-2">
                          View your complete on-chain identity & activity
                        </p>
                        <div className="flex items-center justify-center text-blue-300 text-xs">
                          <span>Transactions • Tokens • NFTs • Contracts</span>
                          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
          )}
                </div>
              </div>

              {/* ===== TRENDS - PRZENIESIONE Z PRAWEGO PANELU =====
                  Ten sam <SoftTrendsPanel/> z tymi samymi propsami i ten sam
                  kafelek YapScan. Nie ma tu drugiego zrodla liczb ani drugiego
                  komponentu - blok zostal przeniesiony, nie odtworzony.

                  NA TELEFONIE: zakladka "Trends" na dole dalej otwiera dokladnie
                  to i tylko to (blok wyzej jest wtedy schowany), wiec trzy
                  zakladki nadal prowadza do trzech roznych ekranow.
                  NA DESKTOPIE: siedzi pod profilem w tej samej kolumnie,
                  oddzielony linia - dlatego przestal byc potrzebny osobny
                  panel po prawej. */}
              <div
                className={`${
                  activeMobilePanel === 'right' ? 'block' : 'hidden lg:block'
                } lg:mt-8 lg:border-t lg:border-soft-line lg:pt-6`}
              >
                <SoftTrendsPanel
                  stats={[
                    /* Bez String() - `null` ma dojsc do kafla JAKO null.
                       String(null) daje napis "null", ktory compact()
                       przepuszcza bez zmian, wiec kafel z niezmierzona liczba
                       pokazywal slowo "null" zamiast kreski. Znak "nie wiem"
                       wstawia SoftTrendsPanel. */
                    { label: 'Users', value: totalUsers, tone: 'purple' },
                    { label: 'Likes', value: totalLikes, tone: 'amber', note: likesNoteText, detail: likesDetailText },
                    { label: 'Posts', value: totalPosts, tone: 'green' },
                    { label: 'Comments', value: totalComments, tone: 'pink' },
                  ]}
                  /* Cala strona, nie pierwsza piatka. Backend oddaje 10 na
                     stronie i do 5 stron (1-50) - `slice(0, 5)` obcinal to
                     w polowie i kasowal sens stronicowania, bo strona druga
                     pokazywalaby pozycje 11-15 zamiast 11-20. */
                  activeUsers={(activeUsers || []).map((user: any) => ({
                    address: user.address,
                    name: user.name || `${String(user.address).slice(0, 6)}…${String(user.address).slice(-4)}`,
                    points: user.totalPoints ?? user.points ?? 0,
                    avatar: user.avatar ?? null,
                  }))}
                  onOpenUser={(userAddress) => handleViewBuilderProfile(userAddress)}
                  page={currentPage}
                  totalPages={totalUsersPages}
                  onPageChange={setCurrentPage}
                  isLoadingPage={isLoadingUsers}
                />

                {/* ===== USUNIETE Z PRAWEGO PANELU (poprzedni krok, opis zostaje) =====
                    1. "Global Statistics" - te SAME cztery liczby (Users, Likes,
                       Posts, Comments) renderowal juz SoftTrendsPanel wyzej.
                       Stały wiec dwa razy pod soba, w dwoch roznych stylach.
                       To nie byla nadmiarowa informacja, tylko ta sama
                       informacja dwa razy.

                    2. "Trending Hashtags" - decyzja produktowa wlasciciela.

                    Liczniki (totalUsers, totalLikes...) zostaja - zasilaja
                    SoftTrendsPanel. Za to `trendingTags` i `expandedTagsList`
                    poszly razem z widokiem: po usunieciu tamtego bloku NIC ich
                    juz nie czytalo, a `getTrendingTags(posts)` przemiatal cala
                    liste postow przy KAZDEJ jej zmianie, zeby policzyc hashtagi
                    dla nikogo. */}
                {/* Yaps Stats Widget - ukryty, gdy /yapscan jest wylaczony
                    (config/routeStatus.js). Bez tego kafelek prowadzilby
                    w przekierowanie z powrotem na /basechat. */}
                <div className={`mt-4 ${isRouteDisabled('/yapscan') ? 'hidden' : ''}`}>
                  <a
                    href="/yapscan"
                    className="flex items-center justify-between rounded-card bg-soft-surface p-4 shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    <span className="font-soft-display text-[15px] font-bold text-soft-ink">YapScan</span>
                    <svg className="h-4 w-4 text-soft-primary" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* ===== KOLUMNA GLOWNA: SAM FEED =====
                Stala tu wczesniej nawigacja (szesc kafli GlassIcons) nad
                trescia. Poszla do kolumny bocznej - zostal kompozytor i lista
                postow, czyli to, po co ludzie tu wchodza.

                MIARA CZYTANIA. Kolumna bierze cala wolna szerokosc, ale tresc
                w srodku konczy sie na 640px i stoi na srodku. Bez tego na
                szerokim monitorze linia tekstu w poscie ciagnela sie przez
                cala reszte ekranu i oko gubilo poczatek nastepnej. */}
            <div className={`flex-1 overflow-y-auto bg-soft-bg p-4 lg:px-8 lg:pt-6 lg:pb-24 ${
              activeMobilePanel === 'main' ? 'block w-full' : 'hidden lg:block'
            }`}>
              {/* ===== EKRAN POWITALNY: SAM, POZA KOLUMNA FEEDU =====
                  DLA NIEZALOGOWANEGO GOSCIA TO JEST CALA STRONA. Nic pod nim
                  nie stoi.

                  Byla tu przez chwile wersja z feedem pod spodem - argument
                  brzmial, ze te same posty sa i tak jawne pod /post/[id]
                  oraz /u/[address], wiec bramka niczego nie chroni. Argument
                  jest prawdziwy i nadal obowiazuje (linki z zewnatrz otwieraja
                  sie normalnie), ale nie o to tu chodzi: pierwszy ekran ma
                  postawic JEDNA teze i dac JEDEN przycisk. Lista cudzych postow
                  pod zaproszeniem robila z tego dwa poczatki naraz i rozmywala
                  oba. Decyzja wlasciciela produktu, i jest sluszna.

                  PELNA SZEROKOSC NA DESKTOPIE ZOSTAJE. Blok stal kiedys
                  wewnatrz `max-w-[640px]`, wiec na szerokim ekranie byl waska
                  kartka z pustym lawendowym tlem po obu stronach - wygladal jak
                  zagubione okno dialogowe, a nie jak ekran powitalny produktu.
                  Stoi WYZEJ, obok tamtej kolumny, i bierze cala szerokosc
                  kolumny glownej (kolumna boczna dla goscia jest `lg:hidden`,
                  wiec to praktycznie caly ekran).

                  BEZ `w-screen` I UJEMNYCH MARGINESOW - 100vw liczy sie razem
                  z paskiem przewijania i dokladalo poziomy scroll. To zwykly
                  blok w kontenerze, ktory juz ma cala szerokosc.

                  NA TELEFONIE NIC SIE NIE ZMIENIA: ponizej 640px tamta kolumna
                  i tak niczego nie zwezala, a padding `p-4` jest ten sam. */}
              {!isConnected && <MockFeed />}

              {/* CALA RESZTA SRODKOWEJ KOLUMNY ZA `isConnected`.
                  Nie tylko lista postow: siedza tu takze kompozytor, oprawa
                  mobilna z paskiem sieci i zakladkami oraz przelacznik paneli
                  (builders / following / friends / discover / notifications).
                  Zadna z tych rzeczy nie ma sensu bez portfela, a przy wejsciu
                  goscia doklada tylko pusta ramke pod ekranem powitalnym. */}
              {isConnected && (
              <div className="mx-auto w-full max-w-[640px]">
              {/* ===== OPRAWA MOBILNA - kierunek Soft Social =====
                  Wymienia WYLACZNIE oprawe feedu ponizej progu `lg`: tlo, pasek
                  sieci jako "stories", zakladki-pigulki i zwiniety kompozytor.
                  LISTA POSTOW ZOSTAJE TA SAMA - to jest poprawka po realnej
                  regresji, ktora sam wprowadzilem: podmiana kart postow na
                  wlasne zabrala na telefonie tipy, przypinanie, przyciski
                  transakcji per siec, tresc premium, odznaki agentow i muzyke.
                  Wyglad wolno wymieniac tylko tam, gdzie nic za soba nie ciagnie. */}
              {/* TYLKO NA FEEDZIE.
                  Pasek sieci, zakladki "All Posts / Follows / Basenames"
                  i pigulka "What's happening onchain?" to oprawa LISTY POSTOW.
                  Renderowaly sie jednak nad KAZDYM widokiem srodkowej kolumny:
                  wchodzisz w Powiadomienia albo Discover i dostajesz nad nimi
                  trzy filtry feedu oraz zaproszenie do napisania posta - w
                  miejscu, gdzie zaden post nie powstanie i nic sie nie
                  odfiltruje. Zakladki byly przy tym CZYNNE, wiec klikniecie
                  "Follows" na ekranie powiadomien przelaczalo niewidoczny feed
                  pod spodem.

                  `activeMainPanel === 'feed'` to ta sama galaz, ktora nizej
                  renderuje liste postow - oprawa i tresc wlaczaja sie razem. */}
              <div className={activeMainPanel === 'feed' ? 'lg:hidden' : 'hidden'}>
                <SoftFeedMobile
                  currentAddress={address}
                  avatarUrl={userProfile?.avatar}
                  activeFeed={activeFeed}
                  activeNetwork={mobileNetwork}
                  onNetworkChange={setMobileNetwork}
                  onFeedChange={(id) => setActiveFeed(id as 'forYou' | 'following' | 'baseName')}
                  composerOpen={mobileComposerOpen}
                  onOpenComposer={() => {
                    // Rozwijamy PRAWDZIWY kompozytor zamiast budowac drugi.
                    // Druga implementacja pisania postu bylaby drugim miejscem,
                    // w ktorym trzeba naprawiac ten sam blad - a ten formularz
                    // obsluguje siedem lancuchow, tresc premium, PostCoin,
                    // zalaczniki i muzyke.
                    setMobileComposerOpen(true);
                    // Focus dopiero po tym, jak React wstawi rozwiniety blok do
                    // drzewa - inaczej szukamy pola, ktorego jeszcze nie ma.
                    requestAnimationFrame(() => {
                      const composer = document.querySelector('textarea');
                      composer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      (composer as HTMLTextAreaElement | null)?.focus();
                    });
                  }}
                />
              </div>

              {/* ===== NAWIGACJA WYPROWADZONA Z FEEDU =====
                  Staly tu kafle "All Posts / My Profile / My Feed / Follows /
                  Friends / Discover" (GlassIcons). Cztery z szesciu w ogole
                  nie sa feedem, tylko osobnymi widokami - a mimo to zajmowaly
                  pierwszy ekran nad trescia, po ktora ludzie tu przychodza.

                  Te same szesc akcji, z handlerami przepisanymi jeden do
                  jednego (razem z warunkiem `isConnected` i z galezia
                  `...(address ? [...])`, ktora dokladala trzy ostatnie pozycje
                  dopiero po podlaczeniu portfela), stoi teraz na gorze kolumny
                  bocznej - w tej samej liscie SoftSectionList, ktora telefon ma
                  juz dzis. Jedna nawigacja na obu szerokosciach zamiast dwoch
                  roznych. Szczegoly przy samej liscie. */}

              {/* Wybor sieci. To NIE jest filtr feedu - steruje tym, ktory
                  kompozytor sie pokazuje i na ktorym lancuchu wyladuje post.
                  Dlatego zostaje w kolumnie glownej, tuz nad kompozytorem,
                  a nie w kolumnie bocznej. Podpis dodany, bo sam rzad logotypow
                  nie mowil, co robi klikniecie.

                  W TRYBIE ASK ZNIKA. Ask ma jedna siec i jeden token: budzet
                  jest w USDC, a kontrakt escrow stoi na Base (patrz
                  ASK_ESCROW_CHAIN_ID). Siedem logotypow nad formularzem, ktory
                  i tak poprosi o Base, obiecywaloby wybor, ktorego nie ma -
                  a na 360px zabieraloby caly rzad na nic. */}
              {isConnected && composerMode === 'post' && (
              <div
                className={`mb-4 rounded-card bg-soft-surface p-3 shadow-card lg:block ${
                  mobileComposerOpen ? '' : 'hidden'
                }`}
              >
                <div className="mb-2 px-1 font-soft text-[11.5px] font-bold uppercase tracking-[0.08em] text-soft-ink-faint">
                  Network
                </div>
                <GooeyNav
                  items={[
                    {
                      icon: (
                        <img 
                          src="/logotypy/Base_square_blue.png"
                          alt="Base"
                          className="w-5 h-5 rounded-none"
                        />
                      ),
                      label: 'Base',
                      onClick: () => setActivePostingNetwork('base'),
                      isActive: activePostingNetwork === 'base',
                      color: '#0052FF',
                      specialStyle: 'base'
                    },
                    {
                      icon: (
                        <img 
                          src="/Camp.png"
                          alt="Camp"
                          className="w-5 h-5 rounded-none"
                        />
                      ),
                      label: 'Camp',
                      onClick: () => setActivePostingNetwork('basecamp'),
                      isActive: activePostingNetwork === 'basecamp',
                      color: '#FF6B35',
                      specialStyle: 'camp'
                    },
                    {
                      icon: (
                        <img 
                          src="/Logomark Blue BG.svg" 
                          alt="Linea" 
                          className="w-5 h-5 rounded-none"
                        />
                      ),
                      label: 'Linea',
                      onClick: () => setActivePostingNetwork('linea'),
                      isActive: activePostingNetwork === 'linea',
                      color: '#000000',
                      specialStyle: 'linea'
                    },
                    {
                      icon: (
                        <img 
                          src="/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp"
                          alt="Celo"
                          className="w-6 h-6 rounded-none"
                        />
                      ),
                      label: 'Celo',
                      onClick: () => setActivePostingNetwork('celo'),
                      isActive: activePostingNetwork === 'celo',
                      color: '#FCFF52',
                      specialStyle: 'celo'
                    },
                    {
                      icon: (
                        <img 
                          src="/icons/eth.svg"
                          alt="Ethereum"
                          className="w-5 h-5 rounded-none"
                        />
                      ),
                      label: 'Ethereum',
                      onClick: () => setActivePostingNetwork('ethereum'),
                      isActive: activePostingNetwork === 'ethereum',
                      color: '#627EEA',
                      specialStyle: 'ethereum'
                    },
                    {
                      icon: (
                        <img 
                          src="/logotypy/world-symbol-dark.svg"
                          alt="World Chain"
                          className="w-5 h-5 rounded-none"
                        />
                      ),
                      label: 'World Chain',
                      onClick: () => setActivePostingNetwork('worldchain'),
                      isActive: activePostingNetwork === 'worldchain',
                      color: '#9333EA',
                      specialStyle: 'world'
                    },
                    {
                      icon: (
                        <img
                          src="/robin.webp"
                          alt="Robinhood Chain"
                          className="w-5 h-5 rounded-none"
                        />
                      ),
                      label: 'Robinhood',
                      onClick: () => setActivePostingNetwork('robinhood'),
                      isActive: activePostingNetwork === 'robinhood',
                      color: '#00C805',
                      specialStyle: 'robinhood'
                    }
                  ]}
                />
              </div>
              )}

              {/* Main content switcher based on activeMainPanel (Przełącznik głównej zawartości) */}
              {activeMainPanel === 'builders' ? (
                <div className="rounded-card bg-soft-surface shadow-card mb-4 overflow-hidden">
                  {/* Builder Profile Content */}
                  {selectedBuilderProfile ? (
                    <BuilderProfile 
                      userAddress={selectedBuilderProfile.address}
                      currentUserAddress={address}
                      profile={selectedBuilderProfile}
                      onBackToFeed={handleBackToFeed}
                      onSocialLinksUpdate={(newLinks) => {
                        setSelectedBuilderProfile(prev => ({
                          ...prev!,
                          socialLinks: newLinks
                        }));
                      }}
                    />
                  ) : (
                    <div className="p-6 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-4">
                        <svg className="w-8 h-8 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400">Loading builder profile...</p>
                    </div>
                  )}
                </div>
              ) : activeMainPanel === 'following' ? (
                /* 👥 FOLLOWING VIEW (Widok obserwowanych) */
                <div className="rounded-card bg-soft-surface shadow-card mb-4 overflow-hidden">
                  <FollowingView 
                    currentUserAddress={address || ''}
                    onUserClick={handleViewBuilderProfile}
                  />
                </div>
              ) : activeMainPanel === 'friends' ? (
                /* 🤝 FRIENDS VIEW (Widok znajomych) */
                <div className="rounded-card bg-soft-surface shadow-card mb-4 overflow-hidden">
                  <FriendsView 
                    currentUserAddress={address || ''}
                    onUserClick={handleViewBuilderProfile}
                  />
                </div>
              ) : activeMainPanel === 'discover' ? (
                /* 🔍 DISCOVER VIEW (Widok odkrywania) */
                <div className="rounded-card bg-soft-surface shadow-card mb-4 overflow-hidden">
                  <DiscoverView 
                    currentUserAddress={address || ''}
                    onUserClick={handleViewBuilderProfile}
                  />
                </div>
              ) : activeMainPanel === 'notifications' ? (
                /* 🔔 NOTIFICATIONS VIEW (Widok powiadomień) */
                <div className="rounded-card bg-soft-surface shadow-card mb-4 overflow-hidden">
                  <NotificationsView 
                    currentUserAddress={address || ''}
                    onUserClick={handleViewBuilderProfile}
                  />
                </div>
              ) : (
                <>
                  {/* New post creation.

                      Ekranu powitalnego NIE MA juz w tej galezi - wyszedl
                      o poziom wyzej, nad cala kolumne feedu (szukaj
                      "EKRAN POWITALNY: NAD FEEDEM I POZA JEGO KOLUMNA"),
                      zeby na desktopie zajmowal pelna szerokosc zamiast stac
                      jako waska kartka w srodku 640-pikselowej kolumny.

                      Tutaj zostal sam kompozytor - dalej za `isConnected`,
                      bo czytanie jest darmowe, a pisanie nie. */}
                  {isConnected && (
                    <>
                      {/* ===== POST ALBO ASK =====
                          Dwie pigulki, nie trzy - pelne uzasadnienie stoi przy
                          deklaracji `composerMode`. W skrocie: PostCoin nie jest
                          trybem, tylko drugim przyciskiem wysylki pod tym samym
                          szkicem, i tak zostaje.

                          Pigulki dziela widocznosc z kompozytorem: na telefonie
                          pojawiaja sie dopiero po dotknieciu plusa
                          (`mobileComposerOpen`), na desktopie stoja zawsze.
                          Inaczej nad zwinietym feedem wisialby wybor, ktory nie
                          ma pod soba niczego do wybrania.

                          `role="group"` + `aria-pressed`, a nie zakladki: to nie
                          jest nawigacja i nic tu nie zmienia adresu - podmienia
                          formularz w miejscu. */}
                      <div
                        role="group"
                        aria-label="What are you posting"
                        className={`mb-3 gap-2 lg:flex ${
                          mobileComposerOpen ? 'flex' : 'hidden'
                        }`}
                      >
                        {([
                          { id: 'post', label: 'Post' },
                          { id: 'ask', label: 'Ask' },
                        ] as const).map((mode) => {
                          const isActive = composerMode === mode.id;
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => setComposerMode(mode.id)}
                              aria-pressed={isActive}
                              className={`flex-none whitespace-nowrap rounded-pill px-4 py-2 font-soft text-[12.5px] transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg ${
                                isActive
                                  ? 'bg-soft-primary font-bold text-white shadow-chip'
                                  : 'bg-soft-surface font-semibold text-soft-ink-muted'
                              }`}
                            >
                              {mode.label}
                            </button>
                          );
                        })}
                      </div>

                      {composerMode === 'ask' ? (
                        /* Ten sam kompozytor, ktory stoi na /asks: budzet,
                           miejsca, termin, wybor escrow i walidacja kwoty za
                           odpowiedz. Druga implementacja tego formularza bylaby
                           drugim miejscem, w ktorym trzeba naprawiac ten sam
                           blad - a ten formularz dotyka pieniedzy.

                           `mb-6` i zwijanie na telefonie - jak kompozytor postu
                           obok, zeby przelaczenie trybu nie przesuwalo feedu. */
                        <AskComposer
                          onSubmit={handleCreateAskFromFeed}
                          className={`mb-6 lg:block ${mobileComposerOpen ? '' : 'hidden'}`}
                          disabled={!askFlow.walletConnected}
                          disabledReason="Connect your wallet to post an Ask."
                          escrowAvailable={askFlow.escrowAvailable}
                          escrowUnavailableReason={askFlow.escrowUnavailableReason}
                          escrowFeeBps={askFlow.feeBps}
                          progressNote={askFlow.progressNote}
                          // Ten sam wybor skarbca co na /asks i z tego samego
                          // powodu: adres przepisany recznie wiaze Aska z niczym.
                          // Odczyt idzie dopiero po wybraniu trybu "Ask", bo
                          // kompozytor montuje sie dopiero wtedy.
                          loadVaults={loadListedVaults}
                          // Bez `onCancel`: wyjsciem z tego formularza jest
                          // pigulka "Post" tuz nad nim. Drugi przycisk robiacy
                          // to samo kazalby zgadywac, ktory z nich czysci szkic.
                        />
                      ) : canCreatePosts ? (
                        /* Na telefonie zwiniety, dopoki ktos nie tknie plusa w
                           pigulce - patrz `mobileComposerOpen`. Na desktopie
                           (`lg:block`) stoi otwarty jak dotad. */
                        <div
                          className={`rounded-card bg-soft-surface p-4 shadow-card mb-6 lg:block ${
                            mobileComposerOpen ? '' : 'hidden'
                          }`}
                        >
                          {/* Show Base post form conditionally */}
                          {activePostingNetwork === 'base' && (
                            <>
                          <div className="flex items-center space-x-3 mb-4">
                            {userProfile.avatar ? (
                              <img
                                src={userProfile.avatar}
                                alt="Profile"
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <Avatar address={address} className="w-10 h-10 rounded-full" />
                            )}
                            <div className="flex-1">
                              <textarea
                                value={newPost}
                                onChange={(e) => setNewPost(e.target.value)}
                                placeholder="What's happening onchain?"
                                className="w-full resize-none rounded-card bg-soft-sunken px-4 py-3 font-soft text-[14px] text-soft-ink placeholder-soft-ink-soft focus:outline-none focus:ring-2 focus:ring-soft-primary"
                                rows={3}
                              />

                              {/* Ta sama informacja, ktora byla wczesniej
                                  UPCHNIETA W PLACEHOLDER ("Add any photo, first
                                  letters of your post will be a $ticker, and
                                  launch your PostCoin or just Post your thoughts
                                  onchain."). Placeholder znika w chwili, gdy
                                  zaczynasz pisac - czyli zasada dzialania
                                  $tickera znikala dokladnie wtedy, kiedy byla
                                  potrzebna. Nic nie ubylo, tresc stoi na stale
                                  pod polem. */}
                              <p className="mt-2 font-soft text-[12px] text-soft-ink-soft">
                                First letters of your post become the $ticker of your PostCoin.
                              </p>

                              <PremiumComposer
                                value={premium}
                                onChange={setPremium}
                                isOpen={isPremiumOpen}
                                onToggle={() => {
                                  const next = !isPremiumOpen;
                                  setIsPremiumOpen(next);
                                  // Zamkniecie sekcji czysci tresc, zeby nie zapisac
                                  // platnej czesci, ktorej autor juz nie widzi.
                                  // Razem z nia znika powod, dla ktorego prosilismy
                                  // o podpis - post bez platnej czesci nie wymaga go
                                  // wcale.
                                  if (!next) {
                                    setPremium(EMPTY_PREMIUM);
                                    setBlockedOnPremiumSignIn(false);
                                  }
                                }}
                              />

                              {/* ===== POST JEST, PLATNEJ CZESCI NIE MA =====
                                  Nieudane pieczetowanie zostawialo po sobie sam
                                  toast - znikal po kilku sekundach, a post
                                  zostawal platny WYLACZNIE w oczach autora.
                                  Teraz stan "nie na sprzedaz" jest widoczny tak
                                  dlugo, jak dlugo trwa, i ma wyjscie: szkic
                                  czeka, wystarczy jedno klikniecie.

                                  Bez pomaranczowego: to nie jest kwota, tylko
                                  informacja o stanie. */}
                              {/* ===== ZATRZYMANE PRZED PUBLIKACJA =====
                                  Post NIE powstal, wiec nie ma tu zadnej
                                  straty do odkrecenia - jest tylko powod
                                  i szkic, ktory czeka nietkniety. */}
                              {blockedOnPremiumSignIn && (
                                <div
                                  role="alert"
                                  className="mt-2 rounded-card border border-soft-line bg-soft-sunken p-3 font-soft text-[12px] leading-[1.5] text-soft-ink-muted"
                                >
                                  <p>
                                    Nothing was posted.{' '}
                                    {siweError ||
                                      'We could not confirm this wallet is yours, and a paid post has to be provably yours before it goes out.'}
                                  </p>
                                  <p className="mt-1 text-soft-ink-faint">
                                    Your draft is untouched - press the post button again to retry, or
                                    remove the paid section to post it for free.
                                  </p>
                                </div>
                              )}

                              {pendingPremium && (
                                <div
                                  role="alert"
                                  className="mt-2 rounded-card border border-soft-line bg-soft-sunken p-3 font-soft text-[12px] leading-[1.5] text-soft-ink-muted"
                                >
                                  <p>
                                    Your last post went out as a free post. {pendingPremium.reason} Nobody
                                    was charged, and nobody sees a paywall on it.
                                  </p>
                                  <p className="mt-1 text-soft-ink-faint">
                                    Your paid text is still here. If you leave this page it is gone, so
                                    finish it now or copy it somewhere safe.
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={retryPremiumSeal}
                                      disabled={isRetryingPremium}
                                      aria-busy={isRetryingPremium}
                                      className="rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-xs font-semibold text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                                    >
                                      {isRetryingPremium
                                        ? 'Working…'
                                        : pendingPremium.needsSignIn
                                          ? 'Sign in and finish it'
                                          : 'Try saving it again'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingPremium(null)}
                                      className="rounded-pill px-1 font-soft-display text-xs font-semibold text-soft-ink-muted underline transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                                    >
                                      Leave it free
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Media preview in post */}
                          {(postPreviewImage || postPreviewVideo) && (
                            <div className="mb-4 relative">
                              {postPreviewImage ? (
                                <img
                                  src={postPreviewImage}
                                  alt="Preview"
                                  className="max-h-60 rounded-lg object-cover"
                                />
                              ) : postPreviewVideo && (
                                <video
                                  src={postPreviewVideo}
                                  className="max-h-60 rounded-lg w-full"
                                  controls
                                >
                                  Your browser does not support video playback.
                                </video>
                              )}
                              <button
                                onClick={() => {
                                  setPostPreviewImage(null);
                                  setPostPreviewVideo(null);
                                }}
                                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                              {uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="absolute bottom-2 left-2 right-2 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}


                          {/* 🎵 Selected Music Preview */}
                          {selectedMusic && (
                            <div className="mb-4 border border-green-300 dark:border-green-600 rounded-lg p-3 bg-green-50 dark:bg-green-900/20">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-green-800 dark:text-green-300">
                                  🎵 Attached Track
                                </h4>
                                <button
                                  onClick={handleRemoveMusic}
                                  className="text-red-500 hover:text-red-700 text-sm"
                                  title="Remove track"
                                >
                                  ✕
                                </button>
                              </div>
                              <SpotifyTrackCard
                                trackData={{ track: selectedMusic }}
                                isCompact={true}
                                showAudioPlayer={false}
                              />
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 sm:space-x-4">
                              <button 
                                onClick={() => document.getElementById('fileInput')?.click()}
                                className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs sm:text-sm bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                title="Add photo or video"
                              >
                                <span className="text-lg">📷</span>
                                <span className="hidden sm:inline font-medium text-blue-600 dark:text-blue-400">Photo</span>
                              </button>

                              <button
                                onClick={() => setShowMusicSelector(true)}
                                className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-green-600 dark:hover:text-green-400 text-xs sm:text-sm bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                                title="Add track from Spotify"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                                </svg>
                                <span className="hidden sm:inline font-medium text-green-600 dark:text-green-400">
                                  {selectedMusic ? 'Change Track' : 'Spotify'}
                                </span>
                              </button>
                            </div>
                            
                            {/* ===== PRZYCISK MILCZAL, ZAMIAST MOWIC, CZEGO BRAKUJE =====
                                Zgloszenie wlasciciela: "jesli tworze post Paid Section
                                i wpisuje tresc to jak go wrzucic, bo przycisk post nie
                                dziala".

                                Przycisk jest wylaczony przez `!newPost.trim()`, czyli
                                wymaga tresci PUBLICZNEJ. Kto rozwinal platna sekcje
                                i wpisal tekst TAM, zostawiajac gorne pole puste, widzi
                                wylacznie wyszarzony przycisk bez slowa wyjasnienia -
                                i sluszne jest wtedy wrazenie, ze aplikacja jest zepsuta.

                                Wymog zostaje, bo jest sensowny: platna czesc bez
                                publicznej to zamknieta skrzynka bez etykiety, ktorej
                                nikt nie ma powodu kupic. Ale ma byc POWIEDZIANY.

                                To samo z siec: warunek na base/baseSepolia tez wyszarzal
                                przycisk po cichu.

                                `aria-live` - komunikat pojawia sie w odpowiedzi na to,
                                co czlowiek wlasnie zrobil, wiec czytnik ekranu ma go
                                przeczytac bez przenoszenia fokusu. */}
                            {(() => {
                              const zlaSiec = chainId !== base.id && chainId !== baseSepolia.id;
                              const brakPublicznej = !newPost.trim();
                              const maPlatna = isPremiumOpen && premium.premiumContent.trim().length > 0;
                              if (isCreatingPost) return null;
                              if (!zlaSiec && !brakPublicznej) return null;
                              return (
                                <p
                                  aria-live="polite"
                                  className="mb-2 font-soft text-[12px] leading-[1.5] text-soft-ink-muted"
                                >
                                  {zlaSiec
                                    ? 'Switch to Base to post.'
                                    : maPlatna
                                      ? 'Add something above the paywall first: a line everyone can read, so people know what they are paying for.'
                                      : 'Write something to post.'}
                                </p>
                              );
                            })()}

                            <div className="flex space-x-2">
                            <button
                              onClick={handleCreatePost}
                                    disabled={!newPost.trim() || isCreatingPost || (chainId !== base.id && chainId !== baseSepolia.id)}
                              className={`px-3 py-0.5 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center h-[32px] ${ 
                                      (!newPost.trim() || isCreatingPost || (chainId !== base.id && chainId !== baseSepolia.id))
                                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    : 'bg-white text-[#0052FF] border border-[#0052FF]'
                              }`}
                            >
                              {isCreatingPost ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#0052FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span className="leading-tight">Creating...</span>
                                </>                                  
                              ) : (
                                  <>
                                    <img 
                                      src="/android-chrome-512x512.png"
                                      alt="Sphere"
                                      className="w-4 h-4 mr-1.5"
                                    />
                                    <span className="leading-tight">PostCoin</span>
                                  </>
                              )}
                            </button>
                              
                              <TransactionButton
                                content={newPost}
                                onTransactionSuccess={handleTransactionSuccess}
                                disabled={isCreatingPost}
                                autoPost={true}
                                /* Podpis PRZED transakcja. Na tej sciezce post
                                   powstaje po zaplaceniu za gaz, wiec pytanie
                                   o sesje dopiero potem znaczylo, ze autor
                                   placi za publikacje, ktora i tak nie moze
                                   stac sie platna. */
                                beforeTransaction={ensurePremiumSession}
                              />
                            </div>
                          </div>
                          <input
                            id="fileInput"
                            type="file"
                            accept="image/*,video/*"
                            onChange={handlePostFileSelect}
                            className="hidden"
                          />

                          {/* 🎵 Music Selector Modal */}
                          <MusicSelector
                            isOpen={showMusicSelector}
                            onClose={() => setShowMusicSelector(false)}
                            onSelectTrack={handleSelectMusic}
                          />
                            </>
                          )}

                          {/* Add BaseCamp post form conditionally */}
                          {activePostingNetwork === 'basecamp' && (
                            <div>
                              <CreatePostBaseCamp onPostCreated={refreshPosts} />
                              <ClaimPortalBanner />
                            </div>
                          )}

                          {/* Add Linea post form conditionally */}
                          {activePostingNetwork === 'linea' && (
                            <CreatePostLinea onPostCreated={refreshPosts} />
                          )}

                          {/* Add Celo post form conditionally */}
                          {activePostingNetwork === 'celo' && (
                            <CreatePostCelo onPostCreated={refreshPosts} />
                          )}

                          {/* Add Ethereum post form conditionally */}
                          {activePostingNetwork === 'ethereum' && (
                            <CreatePostEthereum onPostCreated={refreshPosts} />
                          )}

                          {/* Add World Chain post form conditionally */}
                          {activePostingNetwork === 'worldchain' && (
                            <CreatePostWorldChain onPostCreated={refreshPosts} />
                          )}

                          {/* Add Robinhood Chain post form conditionally.
                              Kontrakt postow nie jest jeszcze wdrozony - komponent sam
                              pokazuje baner i wylacza przycisk wysylki. */}
                          {activePostingNetwork === 'robinhood' && (
                            <CreatePostRobinhood onPostCreated={refreshPosts} />
                          )}
                        </div>
                      ) : (
                        <div className="bg-white rounded-xl p-6 text-center shadow-lg mb-6 border border-[#0052FF]/20 relative overflow-hidden">
                          {/* Usuwam linię z matrix-code.png i zastępuję ją gradientem */}
                          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/40"></div>
                          <div className="relative z-10">
                            <div className="text-xl font-['Share_Tech_Mono'] text-[#0052FF] mb-3 tracking-[0.2em] animate-glitch">
                              {'>'} SYSTEM_BASECHAT_DETECTED
                            </div>
                            
                            <div className="font-['Share_Tech_Mono'] text-[#0052FF]/80 mb-4 tracking-[0.15em] text-base typewriter">
                              {'>'} INITIALIZING_ONCHAIN_PROTOCOL
                              <span className="animate-blink ml-1">_</span>
                            </div>

                            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mb-4 animate-scan"></div>

                            <div className="font-['Share_Tech_Mono'] text-[#0052FF] mb-4 tracking-[0.15em] text-lg animate-glitch-2">
                              {'>'} BRING_NEW_PEOPLE_ONCHAIN
                            </div>

                            <div className="flex justify-center mb-4">
                              <div className="w-16 h-px bg-[#0052FF]/50"></div>
                            </div>

                            <div className="font-['Share_Tech_Mono'] text-[#0052FF]/80 mb-4 tracking-[0.15em] text-base">
                              {'>'} BASENAME_REQUIRED
                              <span className="animate-blink ml-1">_</span>
                            </div>

                            <a href="https://www.base.org/names" target="_blank" rel="noopener noreferrer" 
                              className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-[#0052FF] to-[#0040CC] text-white text-sm font-medium rounded-full transition-all duration-200 transform hover:scale-[1.02] shadow-[0_8px_16px_-3px_rgba(0,82,255,0.5)] hover:shadow-[0_12px_20px_-3px_rgba(0,82,255,0.6)] relative overflow-hidden group">
                              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"></div>
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                              Claim Basename
                              <span className="ml-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-xs px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                            </a>
                          </div>
                    </div>
                  )}
                      {/* ===== KWIT ZA ZALOZONEGO ASKA =====
                          Po zalozeniu Aska z feedu czlowiek ma zobaczyc, ze cos
                          POWSTALO, i to bez odsylania go na /asks. Pas nad
                          feedem czyta z cache'u (piec minut), wiec sam by tego
                          nie pokazal - dlatego karta stoi tutaj, zlozona z
                          tego, co naprawde poszlo do zapisu.

                          Zostaje na ekranie takze po powrocie na pigulke
                          "Post": to potwierdzenie czegos, co juz sie stalo,
                          a nie czesc formularza. Znika dopiero z odswiezeniem
                          strony - wtedy Ask jest juz w pasie wyzej.

                          Przycisk karty prowadzi na /asks, bo TAM stoi panel
                          odpowiedzi, przyjmowania i rozstrzygania. Feed nie
                          dubluje tamtej mechaniki. */}
                      {asksCreatedHere.length > 0 && (
                        <section className="mb-6" aria-label="Asks you posted from this device">
                          <h2 className="mb-2.5 px-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint">
                            Posted from this device
                          </h2>
                          <div className="flex flex-col gap-4">
                            {asksCreatedHere.map((ask) => (
                              <AskCard key={ask.id} ask={ask} isAuthor href="/asks" />
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  )}

                  {/* Pinned Posts Section - ukryj w trybie My Feed */}
                  {!showMyFeed && (
                    <PinnedPosts
                      displayUserName={displayUserName}
                      userNames={userNames}
                      onUserNamesUpdate={handleUserNamesUpdate}
                    />
                  )}

                  {/* ===== ASKI W FEEDZIE =====
                      Osobny pas NAD lista postow, a nie karty wplecione miedzy
                      posty. Pelne uzasadnienie tej decyzji (dwa kursory przy
                      dociaganiu stron, memo i stan optymistyczny PostList,
                      tykajacy zegar Aska, rozdzielenie awarii) stoi w naglowku
                      FeedAskRail.tsx.

                      DLA TEGO PLIKU najwazniejsze jest jedno: pas NIE DOTYKA
                      `posts` ani `visiblePosts`. PostList dostaje dokladnie te
                      sama referencje co przedtem, wiec optymistyczne zmiany
                      (serduszko, komentarz) nie maja jak zostac skasowane -
                      patrz komentarz przy deklaracji `visiblePosts`.

                      Pas ma wlasny stan i wlasny cache, wiec nieudany odczyt
                      Askow nie ma drogi do listy postow, a nieudany odczyt
                      postow nie zabiera Askow.

                      W "My Feed" pasa nie ma: tam patrzacy oglada WLASNE posty,
                      a cudze otwarte Aski nie sa czescia tej odpowiedzi. */}
                  {!showMyFeed && (
                    <FeedAskRail viewer={address ?? null} className="mb-4" />
                  )}

                  {/* ===== ODCZYT PADL != PUSTY FEED =====
                      PostList na pustej liscie pisze "No posts found". Gdy
                      Firestore nie odpowiedzial, to zdanie jest nieprawda -
                      posty sa, tylko ich nie dostalismy. Dlatego awaria ma
                      wlasny komunikat i wlasne wyjscie, zamiast podszywac sie
                      pod pusty feed. */}
                  {postsError && posts.length === 0 && !isLoadingPosts ? (
                    <div
                      role="alert"
                      className="rounded-card bg-soft-surface p-6 sm:p-8 shadow-card text-center"
                    >
                      <svg className="mx-auto mb-4 h-10 w-10 text-soft-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <h3 className="font-soft-display text-lg font-bold text-soft-ink mb-2">
                        Couldn&apos;t load the feed
                      </h3>
                      <p className="font-soft text-soft-ink-muted leading-[1.55] mb-4">
                        The posts are there, we just didn&apos;t get them. Check your
                        connection and try again.
                      </p>
                      <button
                        onClick={() => setFeedReloadNonce((value) => value + 1)}
                        className="rounded-pill bg-soft-primary px-5 py-2 font-soft text-[14px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                  <>
                  {/* Tutaj zastępuję kod wyświetlający posty komponentem PostList */}
                  <PostList

                        sortOrder={sortOrder}
                        selectedTag={selectedTag}
                        selectedAuthor={selectedAuthor}
                        onRefreshPosts={onRefreshPosts}
                        displayUserName={displayUserName}
                        userNames={userNames}
                        // Filtr sieci z paska "stories" na telefonie. Na
                        // desktopie mobileNetwork jest zawsze null, wiec lista
                        // idzie w calosci - dokladnie jak przedtem.
                        // Zapamietana referencja, NIE filtr w miejscu - powod
                        // przy deklaracji `visiblePosts`.
                        posts={visiblePosts}
                        isLoading={isLoadingPosts} // Przekaż stan ładowania do PostList
                        showMyFeed={showMyFeed} // Przekaż stan My Feed do PostList
                        getCachedPosts={getCachedPosts} // Przekaż funkcje cache'owania
                        setCachedPosts={setCachedPosts}
                        clearPostsCache={clearPostsCache}
                        patchPostInCache={patchPostInCache}
                        pendingPins={pendingPins} // Przekaż pending pins state
                        onPinPending={handlePinPending} // Przekaż pending pin handler
                      />
                  </>
                  )}
                </>
              )}
              </div>
              )}
            </div>

              {/* Panel prawy zostal scalony z kolumna boczna - jego zawartosc
                  (SoftTrendsPanel + kafelek YapScan) stoi teraz pod profilem,
                  patrz komentarz "TRENDS - PRZENIESIONE Z PRAWEGO PANELU". */}
            </div>
          </div>
          </div>

      {/* Animowany modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                {modalType === 'error' && (
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                {modalType === 'warning' && (
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                )}
                {modalType === 'confirm' && (
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
                )}
                
                <p className="text-lg mb-4 whitespace-pre-line text-gray-800 dark:text-gray-100">{modalMessage}</p>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    disabled={isUploading}
                  >
                    Cancel
                </button>
                {modalType === 'confirm' && (
                  <button
                    onClick={handleConfirmUpload}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                    disabled={isUploading}
                  >
                      {isUploading ? 'Uploading...' : 'Confirm'}
                  </button>
                )}
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add small padding */}
      <div className="pb-8">
        {/* ... rest of the content ... */}
      </div>


      {/* ===== PASEK ZAKLADEK NA TELEFONIE =====
          Ten sam mechanizm co dotad: trzy przyciski ustawiaja activeMobilePanel
          na 'left' | 'main' | 'right'. Zmieniona jest wylacznie oprawa.

          Co bylo nie tak: pasek stal na polprzezroczystym niebieskim
          (#0052FF/10), a NIEAKTYWNE ikony dostawaly kolor #172554 - prawie
          czarny granat. Na jasnym tle strony ikona nieaktywna byla ciemniejsza
          niz aktywna, wiec pasek pokazywal odwrotnie, gdzie sie stoi. Do tego
          podpisy szly w #60A5FA na jasnym tle, czyli na granicy czytelnosci.

          Teraz: bialy pasek, aktywna zakladka w fiolecie interfejsu i na
          podkladce, nieaktywne w spokojnym szarofiolecie. Doszlo aria-current,
          bo dotad czytnik ekranu nie mial skad wiedziec, ktora zakladka jest
          otwarta. */}
      <nav
        aria-label="Sections"
        className="fixed bottom-0 left-0 right-0 lg:hidden bg-soft-surface/95 backdrop-blur-xl border-t border-soft-line z-40"
      >
        <div className="flex items-center justify-around px-2 pb-3 pt-2">
          <button
            onClick={() => setActiveMobilePanel('left')}
            aria-current={activeMobilePanel === 'left' ? 'page' : undefined}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center rounded-card p-1.5 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            <div className={`p-1 rounded-full ${activeMobilePanel === 'left' ? 'bg-soft-sunken' : ''}`}>
              <UserIcon
                className="w-6 h-6"
                color={activeMobilePanel === 'left' ? '#7C6BDA' : '#8D86AB'}
              />
            </div>
            <span className={`mt-1 font-soft text-[11.5px] font-bold ${activeMobilePanel === 'left' ? 'text-soft-primary-deep' : 'text-soft-ink-soft'}`}>Profile</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('main')}
            aria-current={activeMobilePanel === 'main' ? 'page' : undefined}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center rounded-card p-1.5 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            <div className={`p-1 rounded-full ${activeMobilePanel === 'main' ? 'bg-soft-sunken' : ''}`}>
              <HomeIcon
                className="w-6 h-6"
                color={activeMobilePanel === 'main' ? '#7C6BDA' : '#8D86AB'}
              />
            </div>
            <span className={`mt-1 font-soft text-[11.5px] font-bold ${activeMobilePanel === 'main' ? 'text-soft-primary-deep' : 'text-soft-ink-soft'}`}>Feed</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('right')}
            aria-current={activeMobilePanel === 'right' ? 'page' : undefined}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center rounded-card p-1.5 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            <div className={`p-1 rounded-full ${activeMobilePanel === 'right' ? 'bg-soft-sunken' : ''}`}>
              <ChartBarIcon
                className="w-6 h-6"
                color={activeMobilePanel === 'right' ? '#7C6BDA' : '#8D86AB'}
              />
            </div>
            <span className={`mt-1 font-soft text-[11.5px] font-bold ${activeMobilePanel === 'right' ? 'text-soft-primary-deep' : 'text-soft-ink-soft'}`}>Trends</span>
          </button>

          {/* ===== CZWARTA POZYCJA: ASKS =====
              Powstala strona /asks, trasy API, karta i kompozytor - i NIC do
              nich nie prowadzilo. Na telefonie w ogole nie bylo drogi: dolny
              pasek mial trzy przyciski i zaden nie wychodzil poza feed.

              To NIE jest `SoftDock`, tylko recznie napisany <nav> - i wlasnie
              dlatego czwarty przycisk dodany kiedys do SoftDock nie pojawil sie
              w produkcji. SoftDock uzywa tylko trasa prototypowa /basechat/soft.

              Dlaczego Asks, a nie Follows (pierwotny pomysl): Ask ma byc
              JEDNOSTKA tego produktu, a nie widokiem pobocznym. Follows
              prowadzi do tresci, ktora i tak jest w feedzie pod zakladka;
              Asks prowadzi do jedynej rzeczy, ktorej nie da sie zobaczyc
              nigdzie indziej.

              To <Link>, nie przycisk panelu: Asks to osobna trasa, wiec ma
              dzialac srodkowym przyciskiem myszy i w nowej karcie.

              Piatej pozycji nie dokladamy - przy 320px piec etykiet nie miesci
              sie bez zawijania. */}
          <Link
            href="/asks"
            aria-label="Asks"
            className="flex min-h-[44px] min-w-[44px] flex-col items-center rounded-card p-1.5 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            <div className="p-1 rounded-full">
              {/* Znak zapytania w kolku - Ask to pytanie z kwota. Wektor,
                  nie emoji: emoji renderuje sie inaczej na kazdym systemie. */}
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8D86AB"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.9.7-.9 1.3v.3" />
                <path d="M12 16.5h.01" />
              </svg>
            </div>
            <span className="mt-1 font-soft text-[11.5px] font-bold text-soft-ink-soft">Asks</span>
          </Link>
        </div>
      </nav>

      {/* Padding for mobile footer */}
      <div className="h-20 lg:h-0" />
    </BanPage>
  </>
  );
}

/**
 * Granica Suspense wokol calej strony.
 *
 * BaseChatContent wola useSearchParams(), a ten hook nie ma prawa dzialac
 * podczas statycznego prerenderu - Next przerywa wtedy render bledem
 * "useSearchParams() should be wrapped in a suspense boundary". Wczesniej nie
 * bylo tego widac, bo root layout owijal cala aplikacje w ClientOnly i strona w
 * ogole nie renderowala sie na serwerze.
 *
 * Fallback to pusty <div>, czyli dokladnie to, co BaseChatContent i tak zwraca
 * dopoki nie ustawi sie isMounted - wyjscie na serwerze jest identyczne jak
 * wczesniej, wiec nic sie wizualnie nie zmienia.
 */
export default function BaseChat() {
  return (
    <Suspense fallback={<div></div>}>
      <BaseChatContent />
    </Suspense>
  );
}
