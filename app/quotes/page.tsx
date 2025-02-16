'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { BrowserProvider } from 'ethers';
import axios from 'axios';
import { mintQuote } from './QuotesContract';
import { quotes } from './quotes';
import { useTheme } from '@/app/context/ThemeContext';

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

export default function QuotesPage() {
  const { theme, toggleTheme } = useTheme();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [quote, setQuote] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('AI');
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

  const generateQuote = async () => {
    setIsGenerating(true);
    try {
      let prompt = '';
      let systemMessage = '';
      
      switch (category) {
        case 'AI':
          systemMessage = "Return a short, verified tech quote in exactly this format: 'QUOTE - AUTHOR (YEAR)'. Keep quotes brief and impactful. Use real quotes from: Elon Musk, Bill Gates, Steve Jobs, Alan Turing, etc.";
          prompt = "Share a brief tech quote.";
          break;
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

      if (category === 'AI') {
        setQuote(generatedText);
        setAuthor('');
      } else {
        const [quoteText, authorName] = generatedText.split(' - ');
        setQuote(quoteText.trim());
        setAuthor(authorName?.trim() || '');
      }
    } catch (error) {
      console.error('Error generating quote:', error);
      setQuote('Error generating quote. Please try again.');
      setAuthor('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRandomQuote = () => {
    generateQuote();
  };

  const handleRandomEverything = () => {
    generateQuote();
    setBgColor('#' + Math.floor(Math.random()*16777215).toString(16));
    setFontColor('#' + Math.floor(Math.random()*16777215).toString(16));
    setFontFamily(fonts[Math.floor(Math.random() * fonts.length)]);
    const effects = ['none', 'bold', 'italic', 'underline', 'shadow'];
    setEffect(effects[Math.floor(Math.random() * effects.length)]);
  };

  const handleMint = async () => {
    if (!quote || !address || !walletClient) return;
    setIsMinting(true);
    try {
      const provider = new BrowserProvider(walletClient);
      const signer = await provider.getSigner();
      const tx = await mintQuote(signer, quote, author);
      await tx.wait();
      
      setPoints(prev => prev + 1);
      alert('Quote successfully minted!');
    } catch (error) {
      console.error('Error minting:', error);
      alert('Error minting quote. Please try again.');
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
      console.error('Błąd wyszukiwania zdjęć:', error);
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

  return (
    <div className={`min-h-screen w-full ${theme === 'light' ? 'bg-gray-100' : 'bg-[#0F172A]'}`}>
      <Head />
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-2xl font-bold mb-0 font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            QUOTES
          </h1>
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
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className={`rounded-xl p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
                <label className={`block mb-2 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Category</label>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full mb-3 rounded-lg p-1.5 text-sm ${
                    theme === 'light'
                      ? 'bg-gray-50 border-gray-200 text-gray-900'
                      : 'bg-black/20 border-[#0052FF]/20 text-white'
                  }`}
                >
                  <option value="AI">AI (All)</option>
                  <option value="MOTIVATION">MOTIVATION</option>
                  <option value="WISDOM">WISDOM</option>
                  <option value="LEGENDARY">LEGENDARY (Famous)</option>
                </select>

                <label className={`block mb-2 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Font</label>
                <select 
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className={`w-full mb-3 rounded-lg p-1.5 text-sm ${
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

                <label className={`block mb-2 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Effect</label>
                <select 
                  value={effect}
                  onChange={(e) => setEffect(e.target.value)}
                  className={`w-full mb-3 rounded-lg p-1.5 text-sm ${
                    theme === 'light'
                      ? 'bg-gray-50 border-gray-200 text-gray-900'
                      : 'bg-black/20 border-[#0052FF]/20 text-white'
                  }`}
                >
                  <option value="none">None</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="underline">Underline</option>
                  <option value="shadow">Shadow</option>
                </select>
              </div>

              <div className={`rounded-xl p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
                <h3 className={`mb-3 text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Custom Colors</h3>
                <div className="mb-3">
                  <label className={`block mb-2 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Background Color</label>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className={`w-full h-12 rounded-xl cursor-pointer ${
                      theme === 'light'
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-black/20 border-[#0052FF]/20'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-2 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>Font Color</label>
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    className={`w-full h-12 rounded-xl cursor-pointer ${
                      theme === 'light'
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-black/20 border-[#0052FF]/20'
                    }`}
                  />
                </div>
              </div>

              <div className={`rounded-xl p-4 backdrop-blur-xl border ${
                theme === 'light' 
                  ? 'bg-white border-gray-200 shadow-sm' 
                  : 'bg-black/20 border-[#0052FF]/20'
              }`}>
                <div className="space-y-3">
                  <button
                    onClick={handleRandomQuote}
                    disabled={isGenerating}
                    className={`group relative w-full h-12 rounded-2xl overflow-hidden ${
                      isGenerating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="absolute inset-0 bg-[#0052FF] opacity-100"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/80 to-[#0052FF] opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="absolute inset-0 backdrop-blur-xl bg-black/5"></div>
                    <span className="relative text-white font-['Coinbase_Display'] text-lg">
                      {isGenerating ? 'Generating...' : 'Generate Quote'}
                    </span>
                  </button>

                  <button
                    onClick={handleRandomEverything}
                    disabled={isGenerating}
                    className={`group relative w-full h-12 rounded-2xl overflow-hidden ${
                      isGenerating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="absolute inset-0 bg-[#0052FF]/90 opacity-100"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/70 to-[#0052FF]/90 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="absolute inset-0 backdrop-blur-xl bg-black/5"></div>
                    <span className="relative text-white font-['Coinbase_Display'] text-lg">
                      {isGenerating ? 'Generating...' : 'Random Quote'}
                    </span>
                  </button>

                  <button
                    onClick={handleMint}
                    disabled={isMinting}
                    className={`group relative w-full h-12 rounded-2xl overflow-hidden ${
                      isMinting ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="absolute inset-0 bg-[#0052FF]/80 opacity-100"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/60 to-[#0052FF]/80 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="absolute inset-0 backdrop-blur-xl bg-black/5"></div>
                    <span className="relative text-white font-['Coinbase_Display'] text-lg">
                      {isMinting ? 'Minting...' : 'Collect Quote'}
                    </span>
                  </button>

                  <div className="h-px bg-[#0052FF]/10 my-3"></div>

                  <button
                    onClick={fetchQuoteBackgroundImage}
                    className="group relative w-full h-10 rounded-2xl overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-[#0052FF]/70 opacity-100"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/50 to-[#0052FF]/70 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="absolute inset-0 backdrop-blur-xl bg-black/5"></div>
                    <span className="relative text-white font-['Coinbase_Display'] text-base flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Random Unsplash
                    </span>
                  </button>

                  <button
                    onClick={fetchRandomPexelsBackground}
                    className="group relative w-full h-10 rounded-2xl overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-[#0052FF]/60 opacity-100"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/40 to-[#0052FF]/60 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="absolute inset-0 backdrop-blur-xl bg-black/5"></div>
                    <span className="relative text-white font-['Coinbase_Display'] text-base flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Random Pexels
                    </span>
                  </button>

                  <button
                    onClick={resetQuoteBackground}
                    className="group relative w-full h-10 rounded-2xl overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-[#FF3B30]/20 opacity-100"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#FF3B30]/10 to-[#FF3B30]/20 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="absolute inset-0 backdrop-blur-xl bg-black/5"></div>
                    <span className="relative text-[#FF3B30] font-['Coinbase_Display'] text-base flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Reset Background
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className={`rounded-xl p-4 backdrop-blur-xl border ${
              theme === 'light' 
                ? 'bg-white border-gray-200 shadow-sm' 
                : 'bg-black/20 border-[#0052FF]/20'
            }`}>
              <h3 className={`mb-3 text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Search Pexels Photos</h3>
              
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter search phrase..."
                  className={`flex-1 rounded-lg p-1.5 text-sm ${
                    theme === 'light'
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-black/20 border-[#0052FF]/20'
                  }`}
                />
                <button
                  onClick={searchPexelsPhotos}
                  disabled={isSearching}
                  className={`bg-[#0052FF] hover:bg-[#0052FF]/90 text-white rounded-lg px-3 text-sm transition-all duration-300 ${
                    isSearching ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {searchResults.map((photo) => (
                  <div 
                    key={photo.id}
                    onClick={() => {
                      setIsCustomBackground(true);
                      setQuoteBackgroundImage(photo.src.original);
                    }}
                    className="cursor-pointer hover:opacity-80 transition-opacity duration-300"
                  >
                    <img
                      src={photo.src.tiny}
                      alt={photo.alt}
                      className="w-full h-16 object-cover rounded-lg"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 text-xs text-gray-400">
                <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Photos provided by Pexels
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div 
              className="aspect-square w-[70%] mx-auto rounded-xl overflow-hidden flex items-center justify-center p-4"
              style={{
                backgroundColor: isCustomBackground ? undefined : bgColor,
                backgroundImage: isCustomBackground ? `url(${quoteBackgroundImage})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div 
                className={`text-center max-w-[90%] text-lg md:text-xl lg:text-2xl ${
                  effect === 'bold' ? 'font-bold' : ''
                } ${effect === 'italic' ? 'italic' : ''} ${
                  effect === 'underline' ? 'underline' : ''
                } ${
                  effect === 'shadow' ? 'drop-shadow-lg bg-white/60 px-4 py-2 rounded-full' : ''
                }`}
                style={{
                  fontFamily,
                  color: fontColor,
                }}
              >
                {quote ? `${quote}${author ? ` — ${author}` : ''}` : 'Welcome to DailyQuotes On Base! Generate your quote now!'}
              </div>
            </div>

            <div className="flex justify-center">
              {address ? (
                <button
                  onClick={handleMint}
                  disabled={isMinting}
                  className={`w-full bg-[#0052FF] hover:bg-[#0052FF]/90 text-white rounded-lg p-2 text-sm transition-all duration-300 ${
                    isMinting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isMinting ? 'Minting...' : 'Collect Quote'}
                </button>
              ) : (
                <Wallet>
                  <ConnectWallet>Connect Wallet to Collect</ConnectWallet>
                </Wallet>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
