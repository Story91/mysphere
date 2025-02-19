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
      } catch (error) {
        console.error('Error fetching approved quotes:', error);
      }
    };

    fetchApprovedQuotes();
  }, []);

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
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setQuoteType('own')}
            className={`p-3 rounded-lg transition-colors ${
              quoteType === 'own'
                ? 'bg-[#0052FF] text-white'
                : theme === 'light'
                  ? 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                  : 'bg-black/20 hover:bg-black/30 text-white'
            }`}
          >
            Own Quote
          </button>
          <button
            onClick={() => setQuoteType('known')}
            className={`p-3 rounded-lg transition-colors ${
              quoteType === 'known'
                ? 'bg-[#0052FF] text-white'
                : theme === 'light'
                  ? 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                  : 'bg-black/20 hover:bg-black/30 text-white'
            }`}
          >
            Known Quote
          </button>
        </div>

        {/* Quote Input Section */}
        {quoteType === 'own' ? (
          <>
            <div>
              <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                Your quote (max 100 characters)
              </label>
              <textarea
                value={ownQuote}
                onChange={(e) => {
                  if (e.target.value.length <= 100) {
                    setOwnQuote(e.target.value);
                  }
                }}
                placeholder="Enter your quote..."
                className={`w-full rounded-lg p-2 text-sm min-h-[80px] ${
                  theme === 'light'
                    ? 'bg-gray-50 border-gray-200 text-gray-900'
                    : 'bg-black/20 border-[#0052FF]/20 text-white'
                }`}
              />
              <div className={`text-xs mt-1 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                Characters remaining: {100 - ownQuote.length}
              </div>
            </div>

            {/* Preview for Own Quote */}
            <div>
              <h4 className={`text-sm font-medium mb-2 ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                Preview
              </h4>
              {ownQuote && (
                <div className={`p-3 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-black/20'}`}>
                  <p className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                    {ownQuote}
                  </p>
                  <p className={`text-xs mt-2 italic font-['Dancing Script'] text-base ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {userBaseName?.endsWith('.base.eth') 
                      ? `— ${userBaseName}` 
                      : `${address?.slice(0, 6)}...${address?.slice(-4)} / MySphere`}
                  </p>
                </div>
              )}
            </div>

            {/* My Own Quotes Section */}
            <div className="mt-6">
              <h4 className={`text-sm font-medium mb-2 ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                My Own Quotes
              </h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {ownQuotes.filter(quote => quote.status !== 'approved').length > 0 ? (
                  ownQuotes.filter(quote => quote.status !== 'approved').map((quote) => (
                    <div 
                      key={quote.id}
                      className={`p-3 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-black/20'}`}
                    >
                      <p className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                        {quote.content}
                      </p>
                      <div className="flex justify-between items-center mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          quote.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-500'
                            : 'bg-red-500/20 text-red-500'
                        }`}>
                          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                        </span>
                        <span className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                          {quote.timestamp?.toDate ? new Date(quote.timestamp.toDate()).toLocaleDateString() : 'No date'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={`text-sm text-center py-4 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    No pending or rejected own quotes
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                Category
              </label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full rounded-lg p-2 text-sm ${
                  theme === 'light'
                    ? 'bg-gray-50 border-gray-200 text-gray-900'
                    : 'bg-black/20 border-[#0052FF]/20 text-white'
                }`}
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
            
            {category && category !== 'CUSTOM' && (
              <>
                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                    Known Quote (max 100 characters)
                  </label>
                  <textarea
                    value={knownQuote}
                    onChange={(e) => {
                      if (e.target.value.length <= 100) {
                        setKnownQuote(e.target.value);
                      }
                    }}
                    placeholder="Enter the quote..."
                    className={`w-full rounded-lg p-2 text-sm min-h-[80px] ${
                      theme === 'light'
                        ? 'bg-gray-50 border-gray-200 text-gray-900'
                        : 'bg-black/20 border-[#0052FF]/20 text-white'
                    }`}
                  />
                  <div className={`text-xs mt-1 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    Characters remaining: {100 - knownQuote.length}
                  </div>
                </div>
                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                    Author
                  </label>
                  <input
                    type="text"
                    value={knownQuoteAuthor}
                    onChange={(e) => setKnownQuoteAuthor(e.target.value)}
                    placeholder="Enter author name..."
                    className={`w-full rounded-lg p-2 text-sm ${
                      theme === 'light'
                        ? 'bg-gray-50 border-gray-200 text-gray-900'
                        : 'bg-black/20 border-[#0052FF]/20 text-white'
                    }`}
                  />
                </div>
              </>
            )}

            {/* Preview for Known Quote */}
            <div>
              <h4 className={`text-sm font-medium mb-2 ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                Preview
              </h4>
              {knownQuote && (
                <div className={`p-3 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-black/20'}`}>
                  <p className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                    {knownQuote}
                  </p>
                  {knownQuoteAuthor && (
                    <p className={`text-xs mt-2 italic ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                      — {knownQuoteAuthor}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* My Known Quotes Section */}
            <div className="mt-6">
              <h4 className={`text-sm font-medium mb-2 ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                My Known Quotes
              </h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {knownQuotes.filter(quote => quote.status !== 'approved').length > 0 ? (
                  knownQuotes.filter(quote => quote.status !== 'approved').map((quote) => (
                    <div 
                      key={quote.id}
                      className={`p-3 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-black/20'}`}
                    >
                      <p className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                        {quote.content}
                      </p>
                      <div className="flex justify-between items-center mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          quote.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-500'
                            : 'bg-red-500/20 text-red-500'
                        }`}>
                          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                        </span>
                        <span className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                          {quote.timestamp?.toDate ? new Date(quote.timestamp.toDate()).toLocaleDateString() : 'No date'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={`text-sm text-center py-4 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    No pending or rejected known quotes
                  </p>
                )}
              </div>
            </div>
          </>
        )}
        
        <button
          onClick={quoteType === 'own' ? handleSubmitQuote : handleSubmitKnownQuote}
          disabled={isSubmittingQuote || 
            (quoteType === 'own' ? !ownQuote : (!knownQuote || !knownQuoteAuthor)) || 
            !address}
          className={`w-full bg-[#0052FF] hover:bg-[#0052FF]/90 text-white rounded-xl p-2 sm:p-3 text-sm sm:text-base font-['Coinbase_Display'] transition-all duration-300 ${
            (isSubmittingQuote || 
              (quoteType === 'own' ? !ownQuote : (!knownQuote || !knownQuoteAuthor)) || 
              !address) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isSubmittingQuote ? 'Submitting...' : 'Submit quote for approval'}
        </button>
      </div>

      {/* Sekcja zaakceptowanych cytatów przeniesiona na dół */}
      <div className="mt-6">
        <h4 className={`text-sm font-medium mb-2 ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
          Approved Quotes
        </h4>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {approvedQuotes.length > 0 ? (
            approvedQuotes.map((quote) => (
              <div 
                key={quote.id}
                className={`p-3 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-black/20'}`}
              >
                <p className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                  {quote.content}
                </p>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-500">
                      Approved
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-500">
                      {quote.isOwnQuote ? 'Known Quote' : 'Known Quote'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleUseQuoteForNFT(quote)}
                    className="px-3 py-1 rounded-lg bg-[#0052FF] text-white text-xs font-medium hover:bg-[#0052FF]/90 transition-colors"
                  >
                    Use in NFT
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className={`text-sm text-center py-4 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
              No approved quotes available
            </p>
          )}
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
  const [backdropPadding, setBackdropPadding] = useState(1);
  const quoteFrameRef = useRef<HTMLDivElement>(null);
  const [imageURI, setImageURI] = useState('');
  const [metadataURI, setMetadataURI] = useState('');
  const [authorizedQuotes, setAuthorizedQuotes] = useState<AuthorizedQuote[]>([]);
  const [userBaseName, setUserBaseName] = useState<string | null>(null);
  const [quoteType, setQuoteType] = useState('own');
  const [knownQuoteAuthor, setKnownQuoteAuthor] = useState('');

  // Pobieranie nextTokenId z kontraktu
  const { data: tokenId } = useContractRead({
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
      setNftAuthor(authorName?.trim() || 'Sphere AI');
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
    try {
      // Tworzymy tymczasowy element do zrzutu w stałym rozmiarze
      const tempDiv = document.createElement('div');
      tempDiv.style.width = '1024px';
      tempDiv.style.height = '1024px';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.innerHTML = quoteFrameRef.current.innerHTML;
      
      // Kopiujemy style z oryginalnego elementu
      const computedStyle = window.getComputedStyle(quoteFrameRef.current);
      tempDiv.style.backgroundColor = computedStyle.backgroundColor;
      tempDiv.style.backgroundImage = computedStyle.backgroundImage;
      tempDiv.style.backgroundSize = 'cover';
      tempDiv.style.backgroundPosition = 'center';
      tempDiv.style.display = 'flex';
      tempDiv.style.alignItems = 'center';
      tempDiv.style.justifyContent = 'center';
      
      // Ustawiamy stały rozmiar tekstu dla zrzutu
      const textElement = tempDiv.querySelector('div[style*="fontFamily"]') as HTMLElement;
      if (textElement) {
        textElement.style.fontSize = '32px';
        textElement.style.maxWidth = '80%';
        textElement.style.lineHeight = '1.3';
      }
      
      document.body.appendChild(tempDiv);

      // Robimy zrzut tymczasowego elementu
      const canvas = await html2canvas(tempDiv, {
        width: 1024,
        height: 1024,
        scale: 1,
        useCORS: true,
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

      // Upload snapshota i metadanych na IPFS
      const metadataUri = await uploadToIPFS(blob, quote, author, nextTokenId);
      setMetadataURI(metadataUri);
      
      alert('Quote captured and uploaded to IPFS successfully!');
    } catch (error) {
      console.error('Error capturing quote:', error);
      alert('Error capturing quote. Please try again.');
    } finally {
      setIsMinting(false);
    }
  };

  const handleMint = async () => {
    if (!address || !walletClient || !metadataURI || !publicClient) {
      alert('First capture the quote image!');
      return;
    }
    
    setIsMinting(true);
    try {
      // Przygotuj dane transakcji
      const { request } = await publicClient.simulateContract({
        address: mintContractAddress as `0x${string}`,
        abi: mintABI,
        functionName: 'mintTo',
        args: [address, metadataURI],
        account: address,
      });

      // Wyślij transakcję
      const hash = await walletClient.writeContract(request);
      console.log('Transaction hash:', hash);

      // Poczekaj na potwierdzenie
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
      setPoints(prev => prev + 1);
        alert('Quote minted successfully as NFT!');
        
        setImageURI('');
        setMetadataURI('');
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      console.error('Error minting:', error);
      alert(`Error minting quote: ${error.message}`);
    } finally {
      setIsMinting(false);
    }
  };

  const searchPexelsPhotos = async () => {
    setIsSearching(true);
    try {
      const response = await fetch(`https://api.pexels.com/v1/search?query=${searchQuery}&per_page=15`, {
        headers: {
          'Authorization': `${process.env.NEXT_PUBLIC_PEXELS_API_KEY}`
        }
      });
      const data = await response.json();
      setSearchResults(data.photos);
    } catch (error) {
      console.error('Error searching photos:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchQuoteBackgroundImage = async () => {
    try {
      const response = await axios.get(
        `https://api.unsplash.com/photos/random?query=nature&orientation=landscape&client_id=${process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY}`
      );
      setIsCustomBackground(true);
      setQuoteBackgroundImage(response.data.urls.regular);
    } catch (error) {
      console.error('Error fetching background:', error);
    }
  };

  const fetchRandomPexelsBackground = async () => {
    try {
      const response = await fetch('https://api.pexels.com/v1/curated?per_page=80', {
        headers: {
          'Authorization': `${process.env.NEXT_PUBLIC_PEXELS_API_KEY}`
        }
      });
      const data = await response.json();
      if (data.photos && data.photos.length > 0) {
        const randomIndex = Math.floor(Math.random() * data.photos.length);
        setIsCustomBackground(true);
        setQuoteBackgroundImage(data.photos[randomIndex].src.original);
      }
    } catch (error) {
      console.error('Error fetching background from Pexels:', error);
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
    setNftCategory('SPHERE');
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

  return (
    <div className={`min-h-screen w-full ${theme === 'light' ? 'bg-gray-100' : 'bg-[#0F172A]'}`}>
      <Head />
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-end items-center mb-4">
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-lg transition-all duration-300 ${
              theme === 'light' 
                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' 
                : 'bg-[#0052FF]/10 hover:bg-[#0052FF]/20 text-white'
            }`}
          >
            {theme === 'light' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          {/* Lewa kolumna: 4 Gridy */}
          <div className="order-2 lg:order-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-[calc(100vh-24rem)] lg:h-[calc(100vh-6rem)] overflow-y-auto pb-[calc(100vh-24rem)] lg:pb-0">
            {/* Grid 1: Fonts & Effects */}
            <div className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
              <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                Fonts & Effects
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Font Style</label>
                <select 
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                    className={`w-full mb-3 rounded-lg p-2 text-sm ${
                    theme === 'light'
                      ? 'bg-gray-50 border-gray-200 text-gray-900'
                      : 'bg-black/20 border-[#0052FF]/20 text-white'
                  }`}
                >
                  {fonts.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </option>
                  ))}
                </select>
                </div>
                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Text Effect</label>
                <select 
                  value={effect}
                  onChange={(e) => setEffect(e.target.value)}
                    className={`w-full mb-3 rounded-lg p-2 text-sm ${
                    theme === 'light'
                      ? 'bg-gray-50 border-gray-200 text-gray-900'
                      : 'bg-black/20 border-[#0052FF]/20 text-white'
                  }`}
                >
                  <option value="none">None</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="underline">Underline</option>
                </select>
                </div>
              </div>

              {/* Shadow Controls */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                    Text Backdrop
                  </label>
                  <button
                    onClick={() => setIsShadowEnabled(!isShadowEnabled)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      isShadowEnabled
                        ? 'bg-[#0052FF] text-white'
                        : 'bg-black/20 text-gray-400'
                    }`}
                  >
                    {isShadowEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {isShadowEnabled && (
                  <div className="space-y-4">
                    <div>
                      <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                        Backdrop Color
                      </label>
                      <RgbColorPicker color={shadowColor} onChange={setShadowColor} />
                    </div>
                    <div>
                      <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                        Backdrop Opacity
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={backdropOpacity}
                        onChange={(e) => setBackdropOpacity(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="text-sm text-gray-500 mt-1">
                        {Math.round(backdropOpacity * 100)}%
                      </div>
                </div>
                <div>
                      <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                        Backdrop Padding
                      </label>
                  <input
                        type="range"
                        min="0.2"
                        max="3"
                        step="0.1"
                        value={backdropPadding}
                        onChange={(e) => setBackdropPadding(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="text-sm text-gray-500 mt-1">
                        {backdropPadding.toFixed(1)}rem
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4">
                        <div>
                          <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>R</span>
                          <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{shadowColor.r}</span>
                        </div>
                        <div>
                          <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>G</span>
                          <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{shadowColor.g}</span>
                        </div>
                        <div>
                          <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>B</span>
                          <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{shadowColor.b}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Text Shadow Controls */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                    Text Shadow
                  </label>
                  <button
                    onClick={() => setTextShadowEnabled(!textShadowEnabled)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      textShadowEnabled
                        ? 'bg-[#0052FF] text-white'
                        : 'bg-black/20 text-gray-400'
                    }`}
                  >
                    {textShadowEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {textShadowEnabled && (
                  <div className="space-y-4">
                    <div>
                      <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
                        Shadow Color
                      </label>
                      <RgbColorPicker color={textShadowColor} onChange={setTextShadowColor} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4">
                        <div>
                          <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>R</span>
                          <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{textShadowColor.r}</span>
                        </div>
                        <div>
                          <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>G</span>
                          <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{textShadowColor.g}</span>
                        </div>
                        <div>
                          <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>B</span>
                          <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{textShadowColor.b}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Font Color */}
              <div className="mt-4">
                <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Font Color</label>
                <div className="mb-4">
                  <RgbColorPicker color={fontRgb} onChange={setFontRgb} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    <div>
                      <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>R</span>
                      <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{fontRgb.r}</span>
                    </div>
                    <div>
                      <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>G</span>
                      <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{fontRgb.g}</span>
                    </div>
                    <div>
                      <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>B</span>
                      <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{fontRgb.b}</span>
                    </div>
                  </div>
                  <div>
                    <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>HEX</span>
                    <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{fontColor.toUpperCase()}</span>
                  </div>
                </div>
                </div>
              </div>

            {/* Grid 2: Category AI */}
            <div className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
              <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                Category AI
              </h3>
              <div className="space-y-4">
                <div>
                  <select 
                    value={nftCategory} 
                    onChange={(e) => setNftCategory(e.target.value)}
                    className={`w-full rounded-lg p-2 text-sm ${
                      theme === 'light'
                        ? 'bg-gray-50 border-gray-200 text-gray-900'
                        : 'bg-black/20 border-[#0052FF]/20 text-white'
                    }`}
                  >
                    <option value="MOTIVATION">MOTIVATION - AI Generated Quotes</option>
                    <option value="WISDOM">WISDOM - Philosophical Quotes</option>
                    <option value="LEGENDARY">LEGENDARY - Historical Quotes</option>
                  </select>
                  <p className={`mt-2 text-xs ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                    Using Sphere AI prototype model. Generation takes ~60s. The model may make mistakes, but training it helps improve accuracy.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleRandomQuote}
                    disabled={isGenerating}
                    className={`h-8 rounded-xl bg-[#0052FF] text-white font-medium hover:bg-[#0052FF]/90 transition-colors ${
                      isGenerating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isGenerating ? 'Generating (60s)...' : 'Generate AI Quote'}
                  </button>
                  <button
                    onClick={handleRandomEverything}
                    disabled={isGenerating}
                    className={`h-8 rounded-xl bg-[#4C8FFF] text-white font-medium hover:bg-[#4C8FFF]/90 transition-colors ${
                      isGenerating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isGenerating ? 'Generating (60s)...' : 'Random Everything'}
                  </button>
                </div>
                
                <div className="mt-6">
                  <QuotesCategories onQuoteSelect={handleQuoteSelect} />
                </div>
              </div>
            </div>

            {/* Grid 3: Pexels Search */}
            <div className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
              theme === 'light' 
                ? 'bg-white border-gray-200 shadow-sm' 
                : 'bg-black/20 border-[#0052FF]/20'
            }`}>
              <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                Pexels Search
              </h3>
              <div className="space-y-4">
                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Search Photos</label>
                  <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter keywords..."
                      className={`flex-1 rounded-lg p-2 text-sm ${
                    theme === 'light'
                          ? 'bg-gray-50 border-gray-200 text-gray-900'
                          : 'bg-black/20 border-[#0052FF]/20 text-white'
                  }`}
                />
                <button
                  onClick={searchPexelsPhotos}
                  disabled={isSearching}
                      className="px-4 rounded-xl bg-[#0052FF] text-white font-medium hover:bg-[#0052FF]/90 transition-colors"
                >
                      Search
                </button>
              </div>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                {Array.isArray(searchResults) && searchResults.length > 0 ? (
                  searchResults.map((photo) => (
                  <div 
                    key={photo.id}
                      className="relative cursor-pointer rounded-lg overflow-hidden"
                    onClick={() => {
                      setIsCustomBackground(true);
                      setQuoteBackgroundImage(photo.src.original);
                    }}
                  >
                    <img
                      src={photo.src.tiny}
                      alt={photo.alt}
                        className="w-full h-24 object-cover"
                    />
                  </div>
                  ))
                ) : (
                  <div className={`col-span-2 text-center py-4 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    No results found
                  </div>
                )}
              </div>
              </div>
            </div>

            {/* Grid 4: Background */}
            <div className={`rounded-xl p-3 sm:p-4 backdrop-blur-xl border ${
              theme === 'light' 
                ? 'bg-white border-gray-200 shadow-sm' 
                : 'bg-black/20 border-[#0052FF]/20'
            }`}>
              <h3 className={`text-lg font-bold mb-4 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                Background
              </h3>
              <div className="space-y-4">
                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Color</label>
                  <div className="mb-4">
                    <RgbColorPicker color={bgRgb} onChange={setBgRgb} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      <div>
                        <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>R</span>
                        <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{bgRgb.r}</span>
                      </div>
                      <div>
                        <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>G</span>
                        <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{bgRgb.g}</span>
                      </div>
                      <div>
                        <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>B</span>
                        <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{bgRgb.b}</span>
                      </div>
                    </div>
                    <div>
                      <span className={`text-xs uppercase ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>HEX</span>
                      <span className={`ml-2 text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{bgColor.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={`block mb-2 text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Image</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={fetchQuoteBackgroundImage}
                      className="h-8 rounded-xl bg-[#0052FF] text-white font-medium hover:bg-[#0052FF]/90 transition-colors"
                    >
                      Unsplash
                    </button>
                    <button
                      onClick={fetchRandomPexelsBackground}
                      className="h-8 rounded-xl bg-[#4C8FFF] text-white font-medium hover:bg-[#4C8FFF]/90 transition-colors"
                    >
                      Pexels
                    </button>
                    <button
                      onClick={resetQuoteBackground}
                      className="h-8 rounded-xl bg-red-500/20 text-red-500 font-medium hover:bg-red-500/30 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Create Quote Component */}
            <CreateQuote 
              theme={theme} 
              address={address} 
              userBaseName={userBaseName} 
              setNftQuote={setNftQuote}
              setNftAuthor={setNftAuthor}
            />
          </div>

          {/* Prawa kolumna: NFT Frame */}
          <div className="order-1 lg:order-2 sticky top-[80px] z-40 bg-[#0F172A] lg:bg-transparent pt-4 lg:pt-0">
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
              <div 
                  className={`absolute inset-0 flex items-center justify-center ${
                  effect === 'bold' ? 'font-bold' : ''
                } ${effect === 'italic' ? 'italic' : ''} ${
                  effect === 'underline' ? 'underline' : ''
                }`}
                >
                  <div 
                    className="text-center max-w-[80%] text-[12px] sm:text-[16px] md:text-[20px]"
                style={{
                  fontFamily,
                  color: fontColor,
                    backgroundColor: isShadowEnabled ? `rgba(${shadowColor.r}, ${shadowColor.g}, ${shadowColor.b}, ${backdropOpacity})` : 'transparent',
                      padding: isShadowEnabled ? `${backdropPadding * 1.5}rem ${backdropPadding * 2.5}rem` : '0',
                      borderRadius: isShadowEnabled ? '1.5rem' : '0',
                    backdropFilter: isShadowEnabled ? 'blur(8px)' : 'none',
                    textShadow: textShadowEnabled ? `2px 2px 8px rgba(${textShadowColor.r}, ${textShadowColor.g}, ${textShadowColor.b}, 0.8)` : 'none',
                      lineHeight: '1.3',
                      letterSpacing: '0.01em',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      hyphens: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '100px'
                    }}
                  >
                    {(() => {
                      if (nftQuote && (nftCategory === 'MOTIVATION' || nftCategory === 'WISDOM' || nftCategory === 'LEGENDARY')) {
                        // Cytaty z OpenRouter
                        return `${nftQuote} — ${nftAuthor}`;
                      } else if (nftCategory === 'SPHERE' && nftQuote) {
                        // Cytaty z Sphere Quotes
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
                    className={`w-1/2 bg-[#0052FF] hover:bg-[#0052FF]/90 text-white rounded-xl p-2 sm:p-3 text-sm sm:text-base font-['Coinbase_Display'] transition-all duration-300 ${
                    isMinting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  >
                    {isMinting ? 'Capturing...' : 'Capture Quote'}
                  </button>
                  <button
                    onClick={handleMint}
                    disabled={isMinting || !metadataURI}
                    className={`w-1/2 bg-[#4C8FFF] hover:bg-[#4C8FFF]/90 text-white rounded-xl p-2 sm:p-3 text-sm sm:text-base font-['Coinbase_Display'] transition-all duration-300 ${
                      (isMinting || !metadataURI) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isMinting ? 'Minting...' : 'Collect Quote'}
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
    </div>
  );
} 
