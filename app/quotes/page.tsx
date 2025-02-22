'use client';

import { useEffect, useState, useRef } from 'react';
import { useAccount, useWalletClient, useContractRead, usePublicClient } from 'wagmi';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { BrowserProvider, Contract, parseEther } from 'ethers';
import axios from 'axios';
import { mintQuote } from './QuotesContract';
import { quotes } from './quotes';
import { useTheme } from '@/app/context/ThemeContext';
import { RgbColorPicker } from 'react-colorful';
import QuotesCategories from './QuotesCategories';
import { uploadToIPFS, uploadMetadataToIPFS } from './ipfs-utils';
import html2canvas from 'html2canvas';
import { mintContractAddress, mintABI, MINT_PRICE } from './constants';
import { 
  AuthorizedQuote, 
  getApprovedQuotes, 
  submitQuoteForAuthorization,
  getProfileName,
  db
} from '@/app/utils/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { parseEther as viemParseEther } from 'viem';

const fonts = [
  // Classic Fonts
  'Arial',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  'Impact',
  
  // Modern Sans-Serif
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Lato',
  'Poppins',
  
  // Decorative
  'Pacifico',
  'Dancing Script',
  'Lobster',
  'Permanent Marker',
  
  // Elegant Serif
  'Playfair Display',
  'Merriweather',
  'Crimson Text',
  
  // Modern Display
  'Bebas Neue',
  'Oswald',
  'Anton'
];

interface PexelsPhoto {
  id: number;
  src: {
    original: string;
    tiny: string;
    medium: string;
  };
  alt: string;
}

const Head = () => (
  <>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&family=Montserrat:wght@400;700&family=Lato:wght@400;700&family=Poppins:wght@400;700&family=Pacifico&family=Dancing+Script&family=Lobster&family=Permanent+Marker&family=Playfair+Display:wght@400;700&family=Merriweather:wght@400;700&family=Crimson+Text:wght@400;700&family=Bebas+Neue&family=Oswald:wght@400;700&family=Anton&display=swap" rel="stylesheet" />
  </>
);

// Definicja interfejsu dla props
interface CreateQuoteProps {
  theme: string;
  address: string | undefined;
  userBaseName: string | null;
  setNftQuote: (quote: string) => void;
  setNftAuthor: (author: string) => void;
}

// Komponent CreateQuote
const CreateQuote: React.FC<CreateQuoteProps> = ({ theme, address, userBaseName, setNftQuote, setNftAuthor }) => {
  const [quoteType, setQuoteType] = useState<'own' | 'known'>('own');
  const [ownQuote, setOwnQuote] = useState('');
  const [knownQuote, setKnownQuote] = useState('');
  const [category, setCategory] = useState('CUSTOM');
  const [knownQuoteAuthor, setKnownQuoteAuthor] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [ownQuotes, setOwnQuotes] = useState<AuthorizedQuote[]>([]);
  const [knownQuotes, setKnownQuotes] = useState<AuthorizedQuote[]>([]);
  const [approvedQuotes, setApprovedQuotes] = useState<AuthorizedQuote[]>([]);
  const [filteredQuotes, setFilteredQuotes] = useState<AuthorizedQuote[]>([]);
  const [quoteSearchQuery, setQuoteSearchQuery] = useState('');

  // Pobierz cytaty użytkownika przy montowaniu komponentu
  useEffect(() => {
    const fetchUserQuotes = async () => {
      if (!address) return;
      try {
        // Pobierz wszystkie cytaty z kolekcji authorizedQuotes dla danego użytkownika
        const quotesRef = collection(db, 'authorizedQuotes');
        const q = query(
          quotesRef,
          where('submittedBy', '==', address),
          orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const userQuotes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AuthorizedQuote));

        console.log('Pobrane cytaty użytkownika:', userQuotes);

        // Filtruj cytaty na własne i znane
        const ownQuotesData = userQuotes.filter(q => q.category === 'CUSTOM');
        const knownQuotesData = userQuotes.filter(q => q.category !== 'CUSTOM');
        
        console.log('Własne cytaty:', ownQuotesData);
        console.log('Znane cytaty:', knownQuotesData);
        
        setOwnQuotes(ownQuotesData);
        setKnownQuotes(knownQuotesData);
      } catch (error) {
        console.error('Error fetching user quotes:', error);
      }
    };

    fetchUserQuotes();
  }, [address]);

  // Dodaj useEffect do pobierania zaakceptowanych cytatów
  useEffect(() => {
    const fetchApprovedQuotes = async () => {
      try {
        const quotesRef = collection(db, 'authorizedQuotes');
        const q = query(
          quotesRef,
          where('status', '==', 'approved'),
          orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const quotes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AuthorizedQuote));
        
        setApprovedQuotes(quotes);
        setFilteredQuotes(quotes);
      } catch (error) {
        console.error('Error fetching approved quotes:', error);
      }
    };

    fetchApprovedQuotes();
  }, []);

  // Dodaj useEffect dla wyszukiwania
  useEffect(() => {
    if (!quoteSearchQuery) {
      setFilteredQuotes(approvedQuotes);
      return;
    }

    const searchText = quoteSearchQuery.toLowerCase();
    const filtered = approvedQuotes.filter(quote => 
      quote.content.toLowerCase().includes(searchText) ||
      (quote.category && quote.category.toLowerCase().includes(searchText))
    );
    setFilteredQuotes(filtered);
  }, [quoteSearchQuery, approvedQuotes]);

  const handleSubmitQuote = async () => {
    if (!address || !ownQuote) return;
    
    setIsSubmittingQuote(true);
    try {
      // Modyfikacja formatowania w zależności od posiadania basename
      const formattedQuote = `${ownQuote}\n${
        userBaseName?.endsWith('.base.eth') 
          ? `— ${userBaseName}` 
          : `${address?.slice(0, 6)}...${address?.slice(-4)} / MySphere`
      }`;
      
      await submitQuoteForAuthorization({
        content: formattedQuote,
        submittedBy: address,
        category: 'CUSTOM',
        isOwnQuote: true
      });
      
      alert('Your quote has been submitted for approval!');
      setOwnQuote('');
      
      // Pobierz wszystkie cytaty użytkownika
      const quotesRef = collection(db, 'authorizedQuotes');
      const q = query(
        quotesRef,
        where('submittedBy', '==', address),
        orderBy('timestamp', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const userQuotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AuthorizedQuote));

      // Filtruj cytaty na własne
      const ownQuotesData = userQuotes.filter(q => q.category === 'CUSTOM');
      setOwnQuotes(ownQuotesData);
    } catch (error) {
      console.error('Error submitting quote:', error);
      alert('Error submitting quote. Please try again.');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const handleSubmitKnownQuote = async () => {
    if (!address || !knownQuote || !knownQuoteAuthor || !category || category === 'CUSTOM') return;
    
    setIsSubmittingQuote(true);
    try {
      const quoteWithAuthor = `${knownQuote} - ${knownQuoteAuthor}`;
      await submitQuoteForAuthorization({
        content: quoteWithAuthor,
        submittedBy: address,
        category: category,
        isOwnQuote: false // Dodajemy flagę dla znanych cytatów
      });
      
      alert('Your quote has been submitted for approval!');
      setKnownQuote('');
      setKnownQuoteAuthor('');
      
      // Pobierz wszystkie cytaty użytkownika
      const quotesRef = collection(db, 'authorizedQuotes');
      const q = query(
        quotesRef,
        where('submittedBy', '==', address),
        orderBy('timestamp', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const userQuotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AuthorizedQuote));

      // Filtruj cytaty na znane
      const knownQuotesData = userQuotes.filter(q => q.category !== 'CUSTOM');
      setKnownQuotes(knownQuotesData);
    } catch (error) {
      console.error('Error submitting quote:', error);
      alert('Error submitting quote. Please try again.');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // Dodaj funkcję do używania cytatu jako NFT
  const handleUseQuoteForNFT = (quote: AuthorizedQuote) => {
    if (!quote.isOwnQuote) {
      // Dla znanych cytatów, wyciągnij autora z treści (zakładając format "Treść - Autor")
      const authorMatch = quote.content.match(/ - (.+)$/);
      if (authorMatch) {
        setNftQuote(quote.content.replace(/ - .+$/, ''));
        setNftAuthor(authorMatch[1]);
      } else {
        setNftQuote(quote.content);
        setNftAuthor('');
      }
    } else {
      setNftQuote(quote.content);
      setNftAuthor('');
    }
  };

  return (
    <div className={`col-span-2 rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
      theme === 'light' 
        ? 'bg-white border-gray-200 shadow-sm' 
        : 'bg-black/20 border-[#0052FF]/20'
    }`}>
      <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
        Create Quote
      </h3>
      
      <div className="space-y-4">
        {/* Quote Type Switcher */}
        <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
          <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white flex items-center gap-2">
                Quote Type
                <span className="text-xs text-[#00FFD1]">Pioneer</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setQuoteType('own')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  quoteType === 'own'
                    ? 'bg-[#FF00A8] text-white'
                    : 'bg-black/40 text-gray-400 hover:bg-black/60 hover:text-white'
                }`}
              >
                Own Quote
              </button>
              <button
                onClick={() => setQuoteType('known')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  quoteType === 'known'
                    ? 'bg-[#FF00A8] text-white'
                    : 'bg-black/40 text-gray-400 hover:bg-black/60 hover:text-white'
                }`}
              >
                Known Quote
              </button>
            </div>
          </div>
        </div>

        {/* Quote Input Section */}
        {quoteType === 'own' ? (
          <>
            <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px]">
              <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    Your Quote
                    <span className="text-xs text-[#00FFD1]">Pioneer</span>
                  </label>
                  <span className="text-xs text-gray-400">
                    {100 - ownQuote.length} characters remaining
                  </span>
                </div>
                <textarea
                  value={ownQuote}
                  onChange={(e) => {
                    if (e.target.value.length <= 100) {
                      setOwnQuote(e.target.value);
                    }
                  }}
                  placeholder="Enter your quote..."
                  className="w-full rounded-lg bg-black/50 border-none text-white p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-[#00FFD1] placeholder-gray-400"
                />
              </div>
            </div>

            {/* Preview for Own Quote */}
            {ownQuote && (
              <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#00FFD1] to-[#0052FF] p-[2px]">
                <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-white flex items-center gap-2">
                      Preview
                      <span className="text-xs text-[#0052FF]">Pioneer</span>
                    </label>
                  </div>
                  <div className="rounded-lg bg-black/50 p-3">
                    <p className="text-sm text-white">
                      {ownQuote}
                    </p>
                    <p className="text-xs mt-2 italic font-['Dancing Script'] text-gray-400">
                      {userBaseName?.endsWith('.base.eth') 
                        ? `— ${userBaseName}` 
                        : `${address?.slice(0, 6)}...${address?.slice(-4)} / MySphere`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px]">
              <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    Category
                    <span className="text-xs text-[#00FFD1]">Pioneer</span>
                  </label>
                </div>
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#00FFD1]"
                >
                  <option value="">Select category first</option>
                  <option value="LOVE">LOVE</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="LIFE">LIFE</option>
                  <option value="WISDOM">WISDOM</option>
                  <option value="FRIENDSHIP">FRIENDSHIP</option>
                  <option value="HAPPINESS">HAPPINESS</option>
                  <option value="MOTIVATION">MOTIVATION</option>
                  <option value="HOPE">HOPE</option>
                  <option value="OTHER">OTHER</option>
                  <option value="CRYPTO">CRYPTO</option>
                  <option value="BASE">BASE</option>
                  <option value="AI">AI</option>
                  <option value="TECHNOLOGY">TECHNOLOGY</option>
                  <option value="INNOVATION">INNOVATION</option>
                </select>
              </div>
            </div>
            
            {category && category !== 'CUSTOM' && (
              <>
                <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#00FFD1] to-[#0052FF] p-[2px]">
                  <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-white flex items-center gap-2">
                        Known Quote
                        <span className="text-xs text-[#00FFD1]">Pioneer</span>
                      </label>
                      <span className="text-xs text-gray-400">
                        {100 - knownQuote.length} characters remaining
                      </span>
                    </div>
                    <textarea
                      value={knownQuote}
                      onChange={(e) => {
                        if (e.target.value.length <= 100) {
                          setKnownQuote(e.target.value);
                        }
                      }}
                      placeholder="Enter the quote..."
                      className="w-full rounded-lg bg-black/50 border-none text-white p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-[#0052FF] placeholder-gray-400"
                    />
                  </div>
                </div>

                <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
                  <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-white flex items-center gap-2">
                        Author
                        <span className="text-xs text-[#00FFD1]">Pioneer</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={knownQuoteAuthor}
                      onChange={(e) => setKnownQuoteAuthor(e.target.value)}
                      placeholder="Enter author name..."
                      className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#FF00A8] placeholder-gray-400"
                    />
                  </div>
                </div>

                {/* Preview for Known Quote */}
                {knownQuote && (
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px]">
                    <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-white flex items-center gap-2">
                          Preview
                          <span className="text-xs text-[#00FFD1]">Pioneer</span>
                        </label>
                      </div>
                      <div className="rounded-lg bg-black/50 p-3">
                        <p className="text-sm text-white">
                          {knownQuote}
                        </p>
                        {knownQuoteAuthor && (
                          <p className="text-xs mt-2 italic text-gray-400">
                            — {knownQuoteAuthor}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
        
        <button
          onClick={quoteType === 'own' ? handleSubmitQuote : handleSubmitKnownQuote}
          disabled={isSubmittingQuote || 
            (quoteType === 'own' ? !ownQuote : (!knownQuote || !knownQuoteAuthor)) || 
            !address}
          className={`group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px] w-full transition-all duration-300 hover:scale-[1.02] ${
            (isSubmittingQuote || 
              (quoteType === 'own' ? !ownQuote : (!knownQuote || !knownQuoteAuthor)) || 
              !address) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <div className="relative rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300">
            <div className="flex items-center justify-center gap-2">
              <span className="text-white font-medium">
                {isSubmittingQuote ? 'Submitting...' : 'Submit quote for approval'}
              </span>
              {!isSubmittingQuote && <span className="text-lg">✨</span>}
            </div>
          </div>
        </button>
      </div>

      {/* Community Quotes Section */}
      <div className="mt-6">
        <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
          <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                Community Quotes
                <span className="text-xs text-[#00FFD1]">Pioneer</span>
              </h4>
            </div>
            
            {/* Wyszukiwarka cytatów */}
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search quotes..."
                  value={quoteSearchQuery}
                  onChange={(e) => setQuoteSearchQuery(e.target.value)}
                  className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#0052FF] placeholder-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  🔍
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredQuotes.length > 0 ? (
                filteredQuotes.map((quote) => (
                    <div 
                      key={quote.id}
                      className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[1px]"
                    >
                      <div className="relative rounded-[7px] bg-black/90 p-3">
                        <p className="text-sm text-white">
                          {quote.content}
                        </p>
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-1 rounded-full bg-[#00FFD1]/20 text-[#00FFD1]">
                            Verified
                            </span>
                            <span className="text-xs px-2 py-1 rounded-full bg-[#0052FF]/20 text-[#0052FF]">
                            {quote.isOwnQuote ? 'Own Quote' : 'Known Quote'}
                            </span>
                          {quote.isOwnQuote && userBaseName?.endsWith('.base.eth') && (
                            <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-[#0052FF]">
                              .base.eth
                            </span>
                          )}
                          {!quote.isOwnQuote && quote.category && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[#FF00A8]/20 text-[#FF00A8]">
                              {quote.category}
                            </span>
                          )}
                          {!quote.isOwnQuote && quote.content.includes(' - ') && (
                              <span className="text-xs px-2 py-1 rounded-full bg-[#FFD100]/20 text-[#FFD100]">
                              {quote.content.split(' - ')[1]}
                              </span>
                            )}
                          </div>
                            <button
                              onClick={() => handleUseQuoteForNFT(quote)}
                              className="px-3 py-1 rounded-lg bg-[#0052FF] text-white text-xs font-medium hover:bg-[#0052FF]/90 transition-colors"
                            >
                            Use in NFT
                            </button>
                        </div>
                      </div>
                    </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">✨</span>
                    <p className="text-sm text-gray-400">
                      No community quotes available yet
                    </p>
                    <p className="text-xs text-gray-500">
                      Be the first to contribute!
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Definicje kategorii
const AI_CATEGORIES = ['MOTIVATION', 'WISDOM', 'LEGENDARY'] as const;
const SPHERE_CATEGORIES = ['LOVE', 'SUCCESS', 'LIFE', 'WISDOM', 'FRIENDSHIP', 'HAPPINESS', 'MOTIVATION', 'HOPE', 'OTHER'] as const;
const KNOWN_CATEGORIES = ['LOVE', 'SUCCESS', 'LIFE', 'WISDOM', 'FRIENDSHIP', 'HAPPINESS', 'MOTIVATION', 'HOPE', 'OTHER', 'CRYPTO', 'BASE', 'AI', 'TECHNOLOGY', 'INNOVATION'] as const;

// Modyfikujemy interfejs Toast i stan
const Toast = ({ message, type, isVisible, onClose }: { 
  message: string, 
  type: 'loading' | 'success' | 'error', 
  isVisible: boolean, 
  onClose: () => void 
}) => {
  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-500 ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
      <div className={`group relative overflow-hidden rounded-xl bg-gradient-to-r ${
        type === 'error' 
          ? 'from-[#FF3636] to-[#FF8C36]' 
          : 'from-[#0052FF] to-[#FF00A8]'
      } p-[2px]`}>
        <div className="relative rounded-[10px] bg-black/90 px-6 py-4">
          <div className="flex items-center gap-3">
            {type === 'loading' ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#00FFD1]" />
            ) : type === 'error' ? (
              <span className="text-[#FF3636] text-xl">⚠️</span>
            ) : (
              <span className="text-[#00FFD1] text-xl">✨</span>
            )}
            <p className="text-white text-sm">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function QuotesPage() {
  const { theme, toggleTheme } = useTheme();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [quote, setQuote] = useState('');
  const [nftQuote, setNftQuote] = useState('');
  const [nftAuthor, setNftAuthor] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('MOTIVATION');
  const [nftCategory, setNftCategory] = useState('MOTIVATION');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [effect, setEffect] = useState('none');
  const [bgColor, setBgColor] = useState('#000000');
  const [fontColor, setFontColor] = useState('#FFFFFF');
  const [points, setPoints] = useState(0);
  const [isMinting, setIsMinting] = useState(false);
  const [isCustomBackground, setIsCustomBackground] = useState(false);
  const [quoteBackgroundImage, setQuoteBackgroundImage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PexelsPhoto[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [bgRgb, setBgRgb] = useState({ r: 0, g: 0, b: 0 });
  const [fontRgb, setFontRgb] = useState({ r: 255, g: 255, b: 255 });
  const [shadowColor, setShadowColor] = useState({ r: 0, g: 82, b: 255 });
  const [isShadowEnabled, setIsShadowEnabled] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(0.6);
  const [textShadowEnabled, setTextShadowEnabled] = useState(false);
  const [textShadowColor, setTextShadowColor] = useState({ r: 0, g: 0, b: 0 });
  const [backdropPadding, setBackdropPadding] = useState(2);
  const quoteFrameRef = useRef<HTMLDivElement>(null);
  const [imageURI, setImageURI] = useState('');
  const [metadataURI, setMetadataURI] = useState('');
  const [authorizedQuotes, setAuthorizedQuotes] = useState<AuthorizedQuote[]>([]);
  const [userBaseName, setUserBaseName] = useState<string | null>(null);
  const [quoteType, setQuoteType] = useState('own');
  const [knownQuoteAuthor, setKnownQuoteAuthor] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [activeSection, setActiveSection] = useState<'fonts-effects' | 'background' | 'ai-mysphere' | 'create-quote' | 'pexels-search' | 'text-size' | null>('fonts-effects');
  const [previewFontSize, setPreviewFontSize] = useState(16);
  const [textShadowSize, setTextShadowSize] = useState(4);
  const [textShadowOffset, setTextShadowOffset] = useState(2);
  const [isLogoEnabled, setIsLogoEnabled] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'loading' | 'success' | 'error'>('loading');
  const [isToastVisible, setIsToastVisible] = useState(false);

  // Pobieranie nextTokenId z kontraktu
  const { data: tokenId, refetch: refetchTokenId } = useContractRead({
    address: mintContractAddress,
    abi: mintABI,
    functionName: 'nextTokenIdToMint',
  });

  const nextTokenId = tokenId ? Number(tokenId) : 1;

  // Konwersja RGB na HEX
  const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  };

  // Konwersja HEX na RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  // Aktualizacja kolorów
  useEffect(() => {
    setBgColor(rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b));
  }, [bgRgb]);

  useEffect(() => {
    setFontColor(rgbToHex(fontRgb.r, fontRgb.g, fontRgb.b));
  }, [fontRgb]);

  const handleRandomQuote = async () => {
    setIsGenerating(true);
    try {
      let prompt = '';
      let systemMessage = '';
      
      switch (nftCategory) {
        case 'MOTIVATION':
          systemMessage = "Generate a short, inspiring quote without attribution. Keep it brief and universal. Return just the quote text alone.";
          prompt = "Create a brief motivational quote.";
          break;
        case 'WISDOM':
          systemMessage = "Return a short, verified philosophical quote in exactly this format: 'QUOTE - AUTHOR (YEAR/ERA)'. Keep quotes brief and meaningful. Use real quotes from: Socrates, Plato, Aristotle, Confucius, etc.";
          prompt = "Share a brief philosophical quote.";
          break;
        case 'LEGENDARY':
          systemMessage = "Return a short, verified historical quote in exactly this format: 'QUOTE - AUTHOR (YEAR)'. Keep quotes brief and impactful. Use real quotes from historical figures.";
          prompt = "Share a brief historical quote.";
          break;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://basebook.vercel.app',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1:free',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          frequency_penalty: 0.3,
          presence_penalty: 0.3
        })
      });

      const data = await response.json();
      const generatedText = data.choices[0].message.content.trim();

        const [quoteText, authorName] = generatedText.split(' - ');
      setNftQuote(quoteText.trim());
      setNftAuthor(authorName?.trim() || 'MySphere AI');
    } catch (error) {
      console.error('Error generating quote:', error);
      setNftQuote('Error generating quote. Please try again.');
      setNftAuthor('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRandomEverything = () => {
    handleRandomQuote();
    setBgColor('#' + Math.floor(Math.random()*16777215).toString(16));
    setFontColor('#' + Math.floor(Math.random()*16777215).toString(16));
    setFontFamily(fonts[Math.floor(Math.random() * fonts.length)]);
    const effects = ['none', 'bold', 'italic', 'underline', 'shadow'];
    setEffect(effects[Math.floor(Math.random() * effects.length)]);
  };

  const handleCapture = async () => {
    if (!quoteFrameRef.current) return;
    setIsMinting(true);
    setToastMessage('Capturing your quote and uploading to IPFS...');
    setToastType('loading');
    setIsToastVisible(true);
    
    try {
      // Tworzymy tymczasowy element do zrzutu w stałym rozmiarze
      const tempDiv = document.createElement('div');
      tempDiv.style.width = '1024px';
      tempDiv.style.height = '1024px';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      
      // Dodajemy logo jeśli jest włączone
      if (isLogoEnabled) {
        const logoImg = document.createElement('img');
        logoImg.src = '/favicon_io (1)/apple-touch-icon.png';
        logoImg.alt = 'SPHERE Logo';
        logoImg.style.position = 'absolute';
        logoImg.style.top = '16px';
        logoImg.style.right = '16px';
        logoImg.style.width = '48px';
        logoImg.style.height = '48px';
        logoImg.style.borderRadius = '50%';
        logoImg.style.zIndex = '10';
        tempDiv.appendChild(logoImg);
      }

      // Tworzymy nową strukturę zamiast kopiować innerHTML
      const textContainer = document.createElement('div');
      textContainer.style.position = 'absolute';
      textContainer.style.inset = '0';
      textContainer.style.display = 'flex';
      textContainer.style.alignItems = 'center';
      textContainer.style.justifyContent = 'center';
      if (effect === 'bold') textContainer.style.fontWeight = 'bold';
      if (effect === 'italic') textContainer.style.fontStyle = 'italic';
      if (effect === 'underline') textContainer.style.textDecoration = 'underline';
      
      const textElement = document.createElement('div');
      textElement.style.textAlign = 'center';
      textElement.style.width = '80%';
      textElement.style.fontFamily = fontFamily;
      textElement.style.color = fontColor;
      textElement.style.fontSize = `${previewFontSize + 8}px`;
      textElement.style.lineHeight = '1.3';
      textElement.style.letterSpacing = '0.01em';
      textElement.style.wordBreak = 'break-word';
      textElement.style.overflowWrap = 'break-word';
      textElement.style.hyphens = 'auto';
      textElement.style.display = 'inline-flex';
      textElement.style.flexDirection = 'column';
      textElement.style.alignItems = 'center';
      textElement.style.justifyContent = 'center';
      
      // Dodajemy style dla Text Shadow
      if (textShadowEnabled) {
        textElement.style.textShadow = `${textShadowOffset}px ${textShadowOffset}px ${textShadowSize}px rgba(${textShadowColor.r}, ${textShadowColor.g}, ${textShadowColor.b}, 0.8)`;
      }
      
      // Dodajemy style dla Text Backdrop
      if (isShadowEnabled) {
        textElement.style.backgroundColor = `rgba(${shadowColor.r}, ${shadowColor.g}, ${shadowColor.b}, ${backdropOpacity})`;
        textElement.style.padding = `${backdropPadding}rem ${backdropPadding * 1.5}rem`;
        textElement.style.borderRadius = '0.75rem';
        textElement.style.backdropFilter = 'blur(8px)';
      }

      // Ustawiamy tekst
      textElement.textContent = (() => {
        if (nftQuote && (nftCategory === 'MOTIVATION' || nftCategory === 'WISDOM' || nftCategory === 'LEGENDARY')) {
          return `${nftQuote} — ${nftAuthor}`;
        } else if (nftCategory === 'MYSPHERE' && nftQuote) {
          return `${nftQuote}${nftAuthor ? ` — ${nftAuthor}` : ''}`;
        } else {
          return `Welcome to MySphereAI - Where Your Words Become Digital Art! 🎨\nConnect your wallet to start creating and collecting unique quote NFTs on Base.`;
        }
      })();

      // Składamy elementy
      textContainer.appendChild(textElement);
      tempDiv.appendChild(textContainer);
      
      // Ustawiamy tło
      tempDiv.style.backgroundColor = isCustomBackground ? 'transparent' : bgColor;
      if (isCustomBackground && quoteBackgroundImage) {
        tempDiv.style.backgroundImage = `url(${quoteBackgroundImage})`;
        tempDiv.style.backgroundSize = 'cover';
        tempDiv.style.backgroundPosition = 'center';
      }
      
      document.body.appendChild(tempDiv);

      // Robimy zrzut tymczasowego elementu
      const canvas = await html2canvas(tempDiv, {
        width: 1024,
        height: 1024,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: true
      });

      // Usuwamy tymczasowy element
      document.body.removeChild(tempDiv);

      // Konwertuj canvas na base64 PNG
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      
      // Konwertuj base64 na blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Określ źródło cytatu i kategorię
      let quoteSource: 'AI' | 'MYSPHERE' | 'OWN' | 'KNOWN';
      let finalCategory = nftCategory;

      if (AI_CATEGORIES.includes(nftCategory as any)) {
        quoteSource = 'AI';
        finalCategory = nftCategory; // Zachowaj oryginalną kategorię AI
      } else if (nftCategory === 'MYSPHERE') {
        quoteSource = 'MYSPHERE';
        // Dla cytatów z MySphere, kategoria powinna być jedną z SPHERE_CATEGORIES
        if (!SPHERE_CATEGORIES.includes(category as any)) {
          finalCategory = 'OTHER';
        }
      } else if (quoteType === 'own') {
        quoteSource = 'OWN';
        // Dla własnych cytatów, kategoria powinna być 'CUSTOM'
        finalCategory = 'CUSTOM';
      } else {
        quoteSource = 'KNOWN';
        // Dla znanych cytatów, sprawdź czy kategoria jest prawidłowa
        if (!KNOWN_CATEGORIES.includes(category as any)) {
          finalCategory = 'OTHER';
        }
      }

      // Upload snapshota i metadanych na IPFS
      const metadataUri = await uploadToIPFS(
        blob, 
        nftQuote, 
        nftAuthor, 
        nextTokenId,
        {
          fontFamily,
          effect,
          backgroundColor: bgColor,
          fontColor: fontColor,
          textShadowEnabled,
          textShadowColor,
          isShadowEnabled,
          shadowColor,
          backdropOpacity,
          isCustomBackground,
          backgroundImage: quoteBackgroundImage,
          quoteSource,
          category: finalCategory
        }
      );
      setMetadataURI(metadataUri);
      
      setToastType('success');
      setToastMessage('Quote captured successfully! Click "Collect Quote" to mint your NFT.');
      setTimeout(() => setIsToastVisible(false), 5000);
    } catch (error) {
      console.error('Error capturing quote:', error);
      setToastType('error');
      setToastMessage('Error capturing quote. Please try again.');
      setTimeout(() => setIsToastVisible(false), 5000);
    } finally {
      setIsMinting(false);
    }
  };

  const handleMint = async () => {
    if (!address || !walletClient || !metadataURI || !publicClient) {
      setToastMessage('Please capture the quote image first!');
      setToastType('error');
      setIsToastVisible(true);
      setTimeout(() => setIsToastVisible(false), 5000);
      return;
    }
    
    setIsMinting(true);
    setToastMessage('Minting your NFT...');
    setToastType('loading');
    setIsToastVisible(true);
    
    try {
      // Przygotuj dane transakcji
      const { request } = await publicClient.simulateContract({
        address: mintContractAddress as `0x${string}`,
        abi: mintABI,
        functionName: 'mintTo',
        args: [address, metadataURI],
        account: address,
        value: viemParseEther(MINT_PRICE)
      });

      // Wyślij transakcję
      const hash = await walletClient.writeContract(request);
      console.log('Transaction hash:', hash);

      // Poczekaj na potwierdzenie
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        setPoints(prev => prev + 1);
        setToastType('success');
        setToastMessage('🎉 Congratulations! Your quote has been minted as an NFT!');
        setTimeout(() => setIsToastVisible(false), 5000);
        
        // Odśwież tokenId po udanym mintowaniu
        await refetchTokenId();
        
        setImageURI('');
        setMetadataURI('');
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      console.error('Error minting:', error);
      setToastType('error');
      setToastMessage(`Error minting quote: ${error.message}`);
      setTimeout(() => setIsToastVisible(false), 5000);
    } finally {
      setIsMinting(false);
    }
  };

  const searchPexelsPhotos = async () => {
    setIsSearching(true);
    try {
      const response = await fetch(`https://api.pexels.com/v1/search?query=${searchQuery}&per_page=15`, {
        headers: {
          'Authorization': process.env.NEXT_PUBLIC_PEXELS_API_KEY || '',
        },
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSearchResults(data.photos);
    } catch (error) {
      console.error('Error searching photos:', error);
      alert('Failed to search for photos. Please check if the Pexels API key is configured correctly.');
    } finally {
      setIsSearching(false);
    }
  };

  const fetchQuoteBackgroundImage = async () => {
    try {
      if (!process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY) {
        throw new Error('Unsplash access key is not configured');
      }
      const response = await fetch(
        `https://api.unsplash.com/photos/random?query=nature&orientation=landscape`,
        {
          headers: {
            'Authorization': `Client-ID ${process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY}`
          },
          mode: 'cors'
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      setIsCustomBackground(true);
      setQuoteBackgroundImage(data.urls.regular);
    } catch (error) {
      console.error('Error fetching background:', error);
      alert('Failed to fetch background from Unsplash. Check API configuration or try again later.');
    }
  };

  const fetchRandomPexelsBackground = async () => {
    try {
      if (!process.env.NEXT_PUBLIC_PEXELS_API_KEY) {
        throw new Error('Pexels API key is not configured');
      }

      const response = await fetch('https://api.pexels.com/v1/curated?per_page=80', {
        headers: {
          'Authorization': process.env.NEXT_PUBLIC_PEXELS_API_KEY
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.photos && data.photos.length > 0) {
        const randomIndex = Math.floor(Math.random() * data.photos.length);
        setIsCustomBackground(true);
        setQuoteBackgroundImage(data.photos[randomIndex].src.original);
      } else {
        throw new Error('No photos found');
      }
    } catch (error) {
      console.error('Error fetching background from Pexels:', error);
      alert('Failed to fetch photo from Pexels. Check API configuration or try again later.');
    }
  };

  const resetQuoteBackground = () => {
    setIsCustomBackground(false);
    setQuoteBackgroundImage('');
  };

  // Funkcja do obsługi wyboru cytatu z QuotesCategories
  const handleQuoteSelect = (selectedQuote: string, selectedAuthor: string) => {
    setNftQuote(selectedQuote);
    setNftAuthor(selectedAuthor);
    setNftCategory('MYSPHERE');
  };

  // Add useEffect to fetch authorized quotes when category changes
  useEffect(() => {
    const fetchAuthorizedQuotes = async () => {
      if (category === 'CUSTOM') {
        try {
          const quotes = await getApprovedQuotes(category);
          setAuthorizedQuotes(quotes);
        } catch (error) {
          console.error('Error fetching authorized quotes:', error);
        }
      }
    };

    fetchAuthorizedQuotes();
  }, [category]);

  // Dodaj nowy useEffect do pobierania basename użytkownika
  useEffect(() => {
    const fetchBaseName = async () => {
      if (address) {
        try {
          const name = await getProfileName(address);
          setUserBaseName(name);
        } catch (error) {
          console.error('Error fetching basename:', error);
          setUserBaseName(null);
        }
      }
    };
    
    fetchBaseName();
  }, [address]);

  const handleWithdraw = async () => {
    if (!address || !walletClient || !publicClient) {
      alert('Please connect your wallet first!');
      return;
    }

    try {
      const { request } = await publicClient.simulateContract({
        address: mintContractAddress as `0x${string}`,
        abi: mintABI,
        functionName: 'withdraw',
        account: address
      });

      const hash = await walletClient.writeContract(request);
      console.log('Withdrawal transaction hash:', hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        alert('Funds withdrawn successfully!');
      } else {
        throw new Error('Withdrawal failed');
      }
    } catch (error: any) {
      console.error('Error withdrawing:', error);
      alert(`Error withdrawing funds: ${error.message}`);
    }
  };

  // Dodaj useEffect do sprawdzenia czy użytkownik jest właścicielem
  useEffect(() => {
    const checkOwnership = async () => {
      if (!address || !publicClient) return;
      
      try {
        const ownerAddress = await publicClient.readContract({
          address: mintContractAddress as `0x${string}`,
          abi: mintABI,
          functionName: 'owner'
        });
        
        setIsOwner(address.toLowerCase() === (ownerAddress as string).toLowerCase());
      } catch (error) {
        console.error('Error checking ownership:', error);
      }
    };
    
    checkOwnership();
  }, [address, publicClient]);

  return (
    <div className={`min-h-screen w-full ${theme === 'light' ? 'bg-gray-100' : 'bg-[#0F172A]'}`}>
      <Head />
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          {/* Lewa kolumna: Przełączniki */}
          <div className="order-2 lg:order-1 space-y-4">
            {/* Nawigacja */}
            <div className="relative lg:sticky lg:top-[16px] z-30">
                <div className="grid grid-cols-5 gap-2 mb-4">
                  <button
                    onClick={() => setActiveSection('fonts-effects')}
                    className={`group relative overflow-hidden rounded-xl p-[2px] w-full h-full min-h-[60px] transition-all duration-300 hover:scale-[1.02] ${
                      activeSection === 'fonts-effects'
                        ? 'bg-gradient-to-r from-[#0052FF] to-[#FF00A8]'
                        : 'bg-black/40'
                    }`}
                  >
                    <div className={`relative h-full rounded-[10px] px-2 py-2 transition-all duration-300 ${
                      activeSection === 'fonts-effects'
                        ? 'bg-black/60'
                        : 'bg-black/90 group-hover:bg-black/60'
          }`}>
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <span className="text-base">✨</span>
                        <span className={`text-[9px] font-medium text-center ${
                          activeSection === 'fonts-effects' ? 'text-white' : 'text-gray-400 group-hover:text-white'
                        }`}>Fonts & Effects</span>
        </div>
      </div>
                  </button>

                <button
                    onClick={() => setActiveSection('background')}
                    className={`group relative overflow-hidden rounded-xl p-[2px] w-full h-full min-h-[60px] transition-all duration-300 hover:scale-[1.02] ${
                      activeSection === 'background'
                        ? 'bg-gradient-to-r from-[#FF00A8] to-[#00FFD1]'
                        : 'bg-black/40'
                    }`}
                >
                    <div className={`relative h-full rounded-[10px] px-2 py-2 transition-all duration-300 ${
                      activeSection === 'background'
                        ? 'bg-black/60'
                        : 'bg-black/90 group-hover:bg-black/60'
                    }`}>
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <span className="text-base">🎨</span>
                        <span className={`text-[9px] font-medium text-center ${
                          activeSection === 'background' ? 'text-white' : 'text-gray-400 group-hover:text-white'
                        }`}>Edit Background</span>
                      </div>
                    </div>
                </button>

                  <button
                    onClick={() => setActiveSection('ai-mysphere')}
                    className={`group relative overflow-hidden rounded-xl p-[2px] w-full h-full min-h-[60px] transition-all duration-300 hover:scale-[1.02] ${
                      activeSection === 'ai-mysphere'
                        ? 'bg-gradient-to-r from-[#00FFD1] to-[#0052FF]'
                        : 'bg-black/40'
                    }`}
                  >
                    <div className={`relative h-full rounded-[10px] px-2 py-2 transition-all duration-300 ${
                      activeSection === 'ai-mysphere'
                        ? 'bg-black/60'
                        : 'bg-black/90 group-hover:bg-black/60'
                    }`}>
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <span className="text-base">🤖</span>
                        <span className={`text-[9px] font-medium text-center ${
                          activeSection === 'ai-mysphere' ? 'text-white' : 'text-gray-400 group-hover:text-white'
                        }`}>AI / MySphere</span>
              </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSection('create-quote')}
                    className={`group relative overflow-hidden rounded-xl p-[2px] w-full h-full min-h-[60px] transition-all duration-300 hover:scale-[1.02] ${
                      activeSection === 'create-quote'
                        ? 'bg-gradient-to-r from-[#FFD100] to-[#FF00A8]'
                        : 'bg-black/40'
                    }`}
                  >
                    <div className={`relative h-full rounded-[10px] px-2 py-2 transition-all duration-300 ${
                      activeSection === 'create-quote'
                        ? 'bg-black/60'
                        : 'bg-black/90 group-hover:bg-black/60'
                    }`}>
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <span className="text-base">📝</span>
                        <span className={`text-[9px] font-medium text-center ${
                          activeSection === 'create-quote' ? 'text-white' : 'text-gray-400 group-hover:text-white'
                        }`}>Own / Known</span>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSection('pexels-search')}
                    className={`group relative overflow-hidden rounded-xl p-[2px] w-full h-full min-h-[60px] transition-all duration-300 hover:scale-[1.02] ${
                      activeSection === 'pexels-search'
                        ? 'bg-gradient-to-r from-[#0052FF] to-[#4C8FFF]'
                        : 'bg-black/40'
                    }`}
                  >
                    <div className={`relative h-full rounded-[10px] px-2 py-2 transition-all duration-300 ${
                      activeSection === 'pexels-search'
                        ? 'bg-black/60'
                        : 'bg-black/90 group-hover:bg-black/60'
                    }`}>
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <span className="text-base">🔍</span>
                        <span className={`text-[9px] font-medium text-center ${
                          activeSection === 'pexels-search' ? 'text-white' : 'text-gray-400 group-hover:text-white'
                        }`}>Pexels</span>
                      </div>
                    </div>
                  </button>
              </div>
            </div>

            {/* AI / MySphere Quotes */}
            <div className={`transition-all duration-300 ${activeSection === 'ai-mysphere' ? 'opacity-100 visible' : 'opacity-0 invisible hidden'}`}>
              {/* AI Quotes */}
              <div className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border mb-4 ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
                <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] flex items-center gap-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                  AI Quotes <span className="text-[#0052FF] text-sm">Guardian</span>
                </h3>
                <p className="text-sm text-gray-400 mb-4">Generate unique quotes using artificial intelligence</p>
              <div className="space-y-4">
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
                    <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                      <label className="text-sm font-medium text-white flex items-center justify-between">
                        Category
                        <span className="text-xs text-[#FF00A8]">Premium</span>
                      </label>
                      <select
                        value={nftCategory}
                        onChange={(e) => setNftCategory(e.target.value)}
                        className="w-full mt-2 rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#0052FF]"
                      >
                        <option value="MOTIVATION">AI: Motivation</option>
                        <option value="WISDOM">AI: Wisdom</option>
                        <option value="LEGENDARY">AI: Legendary</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleRandomQuote}
                    disabled={isGenerating}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px] w-full transition-all duration-300 hover:scale-[1.02]"
                  >
                    <div className={`relative rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300 ${isGenerating ? 'opacity-50' : ''}`}>
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="text-white font-medium">{isGenerating ? 'Generating... Please wait' : 'Generate AI Quote'}</span>
                        {!isGenerating && <span className="text-lg">✨</span>}
                        <p className="text-xs text-gray-400">Please wait about 30 seconds due to high traffic. If the result is not satisfactory (AI is still learning), try again.</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* MySphere Quotes */}
            <div className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
                <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] flex items-center gap-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                  MySphere Quotes <span className="text-[#00FFD1] text-sm">Master</span>
                </h3>
                <p className="text-sm text-gray-400 mb-4">Choose from thousands of inspiring quotes</p>
                <QuotesCategories onQuoteSelect={handleQuoteSelect} theme={theme} />
              </div>
            </div>

            {/* Fonts & Effects */}
            <div className={`transition-all duration-300 ${activeSection === 'fonts-effects' ? 'opacity-100 visible' : 'opacity-0 invisible hidden'}`}>
              <div id="fonts-effects" className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
                <div className="space-y-6 lg:space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                        <label className={`block mb-2 text-sm font-medium text-white`}>
                          Font Style
                        </label>
                        <select 
                          value={fontFamily}
                          onChange={(e) => setFontFamily(e.target.value)}
                          className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#0052FF]"
                        >
                          {fonts.map((font) => (
                            <option key={font} value={font} style={{ fontFamily: font }}>
                              {font}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                        <label className={`block mb-2 text-sm font-medium text-white`}>Effect</label>
                        <select 
                          value={effect}
                          onChange={(e) => setEffect(e.target.value)}
                          className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#FF00A8]"
                        >
                          <option value="none">None</option>
                          <option value="bold">Bold</option>
                          <option value="italic">Italic</option>
                          <option value="underline">Underline</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#00FFD1] to-[#0052FF] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
            <div className="flex items-center justify-between mb-4">
                          <label className="text-sm font-medium text-white flex items-center gap-2">
                            Font Color
                            <span className="text-xs text-[#00FFD1]">Pioneer</span>
                          </label>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-white mb-2 block">Color Picker</label>
                            <RgbColorPicker color={fontRgb} onChange={setFontRgb} />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-white mb-2 block">Font Size</label>
                            <input
                              type="range"
                              min="12"
                              max="26"
                              step="1"
                              value={previewFontSize}
                              onChange={(e) => setPreviewFontSize(parseInt(e.target.value))}
                              className="w-full accent-[#00FFD1]"
                            />
                            <div className="text-sm text-gray-400 mt-1">
                              {previewFontSize}px
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-4">
                              <div>
                                <span className="text-xs uppercase text-gray-400">R</span>
                                <span className="ml-2 text-sm font-medium text-white">{fontRgb.r}</span>
                              </div>
                              <div>
                                <span className="text-xs uppercase text-gray-400">G</span>
                                <span className="ml-2 text-sm font-medium text-white">{fontRgb.g}</span>
                              </div>
                              <div>
                                <span className="text-xs uppercase text-gray-400">B</span>
                                <span className="ml-2 text-sm font-medium text-white">{fontRgb.b}</span>
                              </div>
                            </div>
                            <div>
                              <span className="text-xs uppercase text-gray-400">HEX</span>
                              <span className="ml-2 text-sm font-medium text-white">{fontColor.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-gray-700 pt-4 mt-4">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white flex items-center gap-2">
                              SPHERE Logo
                <span className="text-xs text-[#00FFD1]">Pioneer</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setIsLogoEnabled(false)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                  !isLogoEnabled
                                    ? 'bg-[#00FFD1] text-black'
                        : 'bg-black/40 text-gray-400'
                    }`}
                  >
                                Off
                  </button>
                  <button
                                onClick={() => setIsLogoEnabled(true)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                  isLogoEnabled
                                    ? 'bg-[#00FFD1] text-black'
                        : 'bg-black/40 text-gray-400'
                    }`}
                  >
                                On
                  </button>
                            </div>
                          </div>
                        </div>
                      </div>
            </div>
                  
              {/* Text Shadow Controls */}
                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#FFD100] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                        <div className="flex items-center justify-between mb-4">
                          <label className="text-sm font-medium text-white flex items-center gap-2">
                    Text Shadow
                            <span className="text-xs text-[#FFD100]">Pioneer</span>
                  </label>
                          <div className="flex gap-2">
                  <button
                              onClick={() => setTextShadowEnabled(false)}
                              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                !textShadowEnabled
                                  ? 'bg-[#FFD100] text-black'
                        : 'bg-black/40 text-gray-400'
                    }`}
                  >
                              Off
                  </button>
                  <button
                              onClick={() => setTextShadowEnabled(true)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      textShadowEnabled
                                  ? 'bg-[#FFD100] text-black'
                        : 'bg-black/40 text-gray-400'
                    }`}
                  >
                              On
                  </button>
                </div>
                        </div>
                  <div className="space-y-4">
                    <div>
                            <label className="text-sm font-medium text-white mb-2 block">Shadow Color</label>
                      <RgbColorPicker color={textShadowColor} onChange={setTextShadowColor} />
                    </div>
                        <div>
                            <label className="text-sm font-medium text-white mb-2 block">Shadow Size</label>
                            <input
                              type="range"
                              min="2"
                              max="20"
                              step="1"
                              value={textShadowSize}
                              onChange={(e) => setTextShadowSize(parseInt(e.target.value))}
                              className="w-full accent-[#FFD100]"
                            />
                            <div className="text-sm text-gray-400 mt-1">
                              {textShadowSize}px
                        </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-white mb-2 block">Shadow Offset</label>
                <input
                              type="range"
                              min="0"
                              max="10"
                              step="1"
                              value={textShadowOffset}
                              onChange={(e) => setTextShadowOffset(parseInt(e.target.value))}
                              className="w-full accent-[#FFD100]"
                />
                            <div className="text-sm text-gray-400 mt-1">
                              {textShadowOffset}px
                        </div>
                      </div>
                    </div>
              </div>
            </div>
                  
                    {/* Text Backdrop Controls */}
                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#00FFD1] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
            <div className="flex items-center justify-between mb-4">
                          <label className="text-sm font-medium text-white flex items-center gap-2">
                            Text Backdrop
                <span className="text-xs text-[#00FFD1]">Pioneer</span>
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setIsShadowEnabled(false)}
                              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                !isShadowEnabled
                                  ? 'bg-[#00FFD1] text-black'
                                  : 'bg-black/40 text-gray-400'
                              }`}
                            >
                              Off
                            </button>
                  <button
                              onClick={() => setIsShadowEnabled(true)}
                              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                isShadowEnabled
                                  ? 'bg-[#00FFD1] text-black'
                        : 'bg-black/40 text-gray-400'
                    }`}
                  >
                              On
                            </button>
                </div>
                    </div>
                        <div className="space-y-4">
                    <div>
                            <label className="text-sm font-medium text-white mb-2 block">Backdrop Color</label>
                            <RgbColorPicker color={shadowColor} onChange={setShadowColor} />
                    </div>
                    <div>
                            <label className="text-sm font-medium text-white mb-2 block">Opacity</label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={backdropOpacity}
                              onChange={(e) => setBackdropOpacity(parseFloat(e.target.value))}
                              className="w-full accent-[#00FFD1]"
                            />
                            <div className="text-sm text-gray-400 mt-1">
                              {Math.round(backdropOpacity * 100)}%
                    </div>
                  </div>
                  <div>
                            <label className="text-sm font-medium text-white mb-2 block">Padding</label>
                            <input
                              type="range"
                              min="2"
                              max="4"
                              step="0.1"
                              value={backdropPadding}
                              onChange={(e) => setBackdropPadding(parseFloat(e.target.value))}
                              className="w-full accent-[#00FFD1]"
                            />
                            <div className="text-sm text-gray-400 mt-1">
                              {backdropPadding.toFixed(1)}rem
                  </div>
                </div>
                        </div>
                      </div>
                    </div>
                      </div>
                    </div>
                <p className="mt-4 text-xs text-[#0052FF] font-medium">✨ Premium typography features for MySphere Pioneers</p>
                </div>
            </div>
            
            {/* Background */}
            <div className={`transition-all duration-300 ${activeSection === 'background' ? 'opacity-100 visible' : 'opacity-0 invisible hidden'}`}>
              <div id="background" className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
              <div className="space-y-4">
                <div>
                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white flex items-center gap-2">
                            Background Color
                            <span className="text-xs text-[#FF00A8]">Pioneer</span>
                          </span>
                        </div>
                        <div className="mb-4">
                          <RgbColorPicker color={bgRgb} onChange={setBgRgb} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    <div>
                              <span className="text-xs uppercase text-gray-400">R</span>
                              <span className="ml-2 text-sm font-medium text-white">{bgRgb.r}</span>
                    </div>
                    <div>
                              <span className="text-xs uppercase text-gray-400">G</span>
                              <span className="ml-2 text-sm font-medium text-white">{bgRgb.g}</span>
                    </div>
                    <div>
                              <span className="text-xs uppercase text-gray-400">B</span>
                              <span className="ml-2 text-sm font-medium text-white">{bgRgb.b}</span>
                    </div>
                  </div>
                  <div>
                            <span className="text-xs uppercase text-gray-400">HEX</span>
                            <span className="ml-2 text-sm font-medium text-white">{bgColor.toUpperCase()}</span>
                          </div>
                  </div>
                </div>
                </div>
              </div>

                <div>
                    <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Image</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={fetchQuoteBackgroundImage}
                        className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px] transition-all duration-300 hover:scale-[1.02]"
                      >
                        <div className="relative w-full h-full rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300 group-hover:bg-black/70">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-white font-bold">Unsplash Pro</span>
                            <span className="text-xs text-gray-400">Premium Collection</span>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={fetchRandomPexelsBackground}
                        className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px] transition-all duration-300 hover:scale-[1.02]"
                      >
                        <div className="relative w-full h-full rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300 group-hover:bg-black/70">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-white font-bold">Pexels Elite</span>
                            <span className="text-xs text-gray-400">Curated Art</span>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={resetQuoteBackground}
                        className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF3636] to-[#FF8C36] p-[2px] transition-all duration-300 hover:scale-[1.02]"
                      >
                        <div className="relative w-full h-full rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300 group-hover:bg-black/70">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-white font-bold">Reset</span>
                            <span className="text-xs text-gray-400">Clear Background</span>
                          </div>
                        </div>
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-[#0052FF] font-medium">✨ Access to over 1M+ premium backgrounds</p>
                            </div>
                          </div>

                        </div>
                    </div>

            {/* Create Quote Component */}
            <div className={`transition-all duration-300 ${activeSection === 'create-quote' ? 'opacity-100 visible' : 'opacity-0 invisible hidden'}`}>
              <div id="create-quote">
                <CreateQuote 
                  theme={theme} 
        address={address}
        userBaseName={userBaseName}
                  setNftQuote={setNftQuote}
                  setNftAuthor={setNftAuthor}
                              />
              </div>
            </div>

            {/* Pexels Search */}
            <div className={`transition-all duration-300 ${activeSection === 'pexels-search' ? 'opacity-100 visible' : 'opacity-0 invisible hidden'}`}>
              <div id="pexels-search" className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
              theme === 'light' 
                ? 'bg-white border-gray-200 shadow-sm' 
                : 'bg-black/20 border-[#0052FF]/20'
                                }`}>
              <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                Pexels Search
              </h3>
              <div className="space-y-4">
                <div>
                    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
                      <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-white">
                            Search Photos
                          </label>
                              </div>
                  <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter keywords..."
                            className="flex-1 rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#0052FF] placeholder-gray-400"
                />
                                <button
                  onClick={searchPexelsPhotos}
                  disabled={isSearching}
                      className="px-4 rounded-xl bg-[#0052FF] text-white font-medium hover:bg-[#0052FF]/90 transition-colors"
                                >
                            {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>
          </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.isArray(searchResults) && searchResults.slice(0, 8).map((photo) => (
                  <div 
                    key={photo.id}
                        className="relative cursor-pointer rounded-xl overflow-hidden aspect-square group"
                    onClick={() => {
                      setIsCustomBackground(true);
                      setQuoteBackgroundImage(photo.src.original);
                    }}
                  >
                    <img
                          src={photo.src.medium}
                      alt={photo.alt}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <span className="text-white text-sm font-medium">Use this image</span>
                  </div>
                              </div>
                    ))}
                    {isSearching && (
                      <div className="col-span-full flex items-center justify-center py-12">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0052FF] mb-2"></div>
                          <p className="text-gray-400">Searching...</p>
                            </div>
                          </div>
                          )}
                    {!isSearching && Array.isArray(searchResults) && searchResults.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                        <svg className="w-12 h-12 opacity-50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p>No results found</p>
                      </div>
                              )}
                            </div>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200/20">
                    <a 
                      href="https://www.pexels.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
                        >
                      <span>Photos provided by</span>
                      <img src="https://images.pexels.com/lib/api/pexels-white.png" alt="Pexels Logo" className="h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Text Size Controls */}
            <div className={`transition-all duration-300 ${activeSection === 'text-size' ? 'opacity-100 visible' : 'opacity-0 invisible hidden'}`}>
              <div id="text-size" className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
              theme === 'light' 
                ? 'bg-white border-gray-200 shadow-sm' 
                : 'bg-black/20 border-[#0052FF]/20'
            }`}>
                <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] flex items-center gap-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                  Text Size Pro
              </h3>
                <p className="text-sm text-gray-400 mb-4">Adjust text size in preview and NFT</p>
                
                <div className="space-y-6">
                  {/* Preview Text Size Control */}
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FFD100] to-[#FF00A8] p-[2px]">
                    <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-white">Preview text size</label>
                        <span className="text-sm text-[#FFD100]">{previewFontSize}px</span>
                  </div>
                      <input
                        type="range"
                        min="12"
                        max="26"
                        step="1"
                        value={previewFontSize}
                        onChange={(e) => setPreviewFontSize(parseInt(e.target.value))}
                        className="w-full accent-[#FFD100]"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-400">12px</span>
                        <span className="text-xs text-gray-400">26px</span>
                      </div>
                      </div>
                      </div>

                  {/* NFT Text Size Display */}
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#FFD100] p-[2px]">
                    <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-white">NFT text size</label>
                        <span className="text-sm text-[#FFD100]">{previewFontSize + 8}px</span>
                    </div>
                      <div className="text-xs text-gray-400">
                        Text size in NFT is automatically scaled (+8px larger than preview)
                    </div>
                  </div>
                </div>
                  </div>
                          </div>
                        </div>
                    </div>

          {/* Prawa kolumna: NFT Frame */}
          <div className="order-1 lg:order-2 sticky top-0 lg:top-[80px] z-40 bg-black lg:bg-transparent pt-4 lg:pt-0">
            <div className="w-full">
              <div 
                ref={quoteFrameRef}
                className="w-full aspect-square rounded-xl overflow-hidden relative"
                style={{
                  backgroundColor: isCustomBackground ? undefined : bgColor,
                  backgroundImage: isCustomBackground ? `url(${quoteBackgroundImage})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              >
                {isLogoEnabled && (
                  <img 
                    src="/favicon_io (1)/apple-touch-icon.png"
                    alt="SPHERE Logo"
                    className="absolute top-4 right-4 w-12 h-12 rounded-full z-10"
                  />
                )}
                <div 
                  className={`absolute inset-0 flex items-center justify-center ${
                    effect === 'bold' ? 'font-bold' : ''
                  } ${effect === 'italic' ? 'italic' : ''} ${
                    effect === 'underline' ? 'underline' : ''
                  }`}
                >
                  <div 
                    className="text-center w-[80%]"
                style={{
                  fontFamily,
                  color: fontColor,
                    backgroundColor: isShadowEnabled ? `rgba(${shadowColor.r}, ${shadowColor.g}, ${shadowColor.b}, ${backdropOpacity})` : 'transparent',
                      padding: isShadowEnabled ? `${backdropPadding}rem ${backdropPadding * 1.5}rem` : '0',
                      borderRadius: isShadowEnabled ? '0.75rem' : '0',
                    backdropFilter: isShadowEnabled ? 'blur(8px)' : 'none',
                    textShadow: textShadowEnabled ? `${textShadowOffset}px ${textShadowOffset}px ${textShadowSize}px rgba(${textShadowColor.r}, ${textShadowColor.g}, ${textShadowColor.b}, 0.8)` : 'none',
                      lineHeight: '1.3',
                      letterSpacing: '0.01em',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      hyphens: 'auto',
                      fontSize: `${previewFontSize}px`,
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {(() => {
                      if (nftQuote && (nftCategory === 'MOTIVATION' || nftCategory === 'WISDOM' || nftCategory === 'LEGENDARY')) {
                        // Cytaty z OpenRouter
                        return `${nftQuote} — ${nftAuthor}`;
                      } else if (nftCategory === 'MYSPHERE' && nftQuote) {
                        // Cytaty z MySphere Quotes
                        return `${nftQuote}${nftAuthor ? ` — ${nftAuthor}` : ''}`;
                      } else {
                        // Domyślna wiadomość
                        return `Welcome to MySphereAI - Where Your Words Become Digital Art! 🎨\nConnect your wallet to start creating and collecting unique quote NFTs on Base.`;
                      }
                    })()}
                    </div>
                  </div>
                  </div>
                </div>

              <div className="flex justify-center w-full gap-2 sm:gap-4 bg-white/5 backdrop-blur-sm p-2 rounded-xl mt-2">
                {address ? (
                  <>
                    <button
                      onClick={handleCapture}
                      disabled={isMinting}
                      className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px] w-1/2 transition-all duration-300 hover:scale-[1.02]"
                    >
                      <div className={`relative rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300 ${isMinting ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="text-[10px] text-[#00FFD1] font-medium">Step 1</span>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-white font-medium">
                              {isMinting ? 'Capturing...' : 'Capture Quote'}
                            </span>
                            {!isMinting && <span className="text-lg">📸</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={handleMint}
                      disabled={isMinting || !metadataURI}
                      className={`group relative overflow-hidden rounded-xl ${
                        metadataURI 
                          ? 'bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] animate-glow' 
                          : 'bg-gray-800'
                      } p-[2px] w-1/2 transition-all duration-300 hover:scale-[1.02]`}
                    >
                      <div className={`relative rounded-[10px] ${metadataURI ? 'bg-black/60' : 'bg-black/90'} px-4 py-3 transition-all duration-300 ${isMinting ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="text-[10px] text-[#FF00A8] font-medium">Step 2</span>
                          <div className="flex items-center justify-center gap-2">
                            <span className={`font-medium ${metadataURI ? 'text-white' : 'text-gray-400'}`}>
                              {isMinting ? 'Minting...' : 'Collect Quote'}
                            </span>
                            {!isMinting && (
                              <span className="text-lg">
                                {metadataURI ? '💎' : '🔒'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <Wallet>
                    <ConnectWallet className="w-full">Connect Wallet to Collect</ConnectWallet>
                  </Wallet>
                )}
              </div>
          </div>
        </div>
      </div>
      <Toast
        message={toastMessage}
        type={toastType}
        isVisible={isToastVisible}
        onClose={() => setIsToastVisible(false)}
      />
    </div>
  );
} 

