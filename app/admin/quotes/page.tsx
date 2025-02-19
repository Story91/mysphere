'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTheme } from '@/app/context/ThemeContext';
import { 
  AuthorizedQuote,
  getPendingQuotes, 
  updateQuoteStatus,
  ADMIN_ADDRESS 
} from '@/app/utils/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/app/utils/firebase';
import { useRouter } from 'next/navigation';

// Kategorie cytatów
const QUOTE_CATEGORIES = {
  CUSTOM: 'Custom',
  LOVE: 'Love',
  SUCCESS: 'Success',
  LIFE: 'Life',
  WISDOM: 'Wisdom',
  FRIENDSHIP: 'Friendship',
  HAPPINESS: 'Happiness',
  MOTIVATION: 'Motivation',
  HOPE: 'Hope',
  OTHER: 'Other',
  CRYPTO: 'Crypto',
  BASE: 'Base',
  AI: 'AI',
  TECHNOLOGY: 'Technology',
  INNOVATION: 'Innovation'
};

export default function AdminQuotes() {
  const { theme } = useTheme();
  const { address } = useAccount();
  const [pendingQuotes, setPendingQuotes] = useState<AuthorizedQuote[]>([]);
  const [approvedQuotes, setApprovedQuotes] = useState<AuthorizedQuote[]>([]);
  const [rejectedQuotes, setRejectedQuotes] = useState<AuthorizedQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'pending' | 'approved' | 'rejected' | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState(false);
  const [quoteType, setQuoteType] = useState<'own' | 'known' | 'all'>('all');
  const router = useRouter();

  useEffect(() => {
    const fetchQuotes = async () => {
      if (address?.toLowerCase() !== ADMIN_ADDRESS) return;
      
      try {
        setIsLoading(true);
        // Pobierz wszystkie cytaty
        const quotesRef = collection(db, 'authorizedQuotes');
        const q = query(
          quotesRef,
          orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const allQuotes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AuthorizedQuote));

        // Podziel cytaty według statusu
        setPendingQuotes(allQuotes.filter(quote => quote.status === 'pending'));
        setApprovedQuotes(allQuotes.filter(quote => quote.status === 'approved'));
        setRejectedQuotes(allQuotes.filter(quote => quote.status === 'rejected'));
      } catch (error) {
        console.error('Error fetching quotes:', error);
        alert('Error fetching quotes. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotes();
  }, [address]);

  const handleUpdateStatus = async (quoteId: string, status: 'approved' | 'rejected') => {
    if (address?.toLowerCase() !== ADMIN_ADDRESS) {
      alert('Only admin can update quote status');
      return;
    }

    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      await updateQuoteStatus(quoteId, status);
      
      // Aktualizuj lokalne stany
      const updatedQuote = pendingQuotes.find(q => q.id === quoteId);
      if (updatedQuote) {
        setPendingQuotes(prev => prev.filter(q => q.id !== quoteId));
        if (status === 'approved') {
          setApprovedQuotes(prev => [{ ...updatedQuote, status }, ...prev]);
        } else {
          setRejectedQuotes(prev => [{ ...updatedQuote, status }, ...prev]);
        }
      }
      
      alert(`Quote ${status} successfully`);
    } catch (error) {
      console.error('Error updating quote status:', error);
      alert('Error updating quote status. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Filtrowanie cytatów według typu i kategorii
  const getFilteredQuotes = (quotes: AuthorizedQuote[]) => {
    let filteredQuotes = quotes;
    
    // Filtruj według typu (own/known/all)
    if (quoteType !== 'all') {
      filteredQuotes = filteredQuotes.filter(quote => 
        quoteType === 'own' ? quote.isOwnQuote : !quote.isOwnQuote
      );
    }
    
    // Filtruj według kategorii jeśli wybrana
    if (selectedCategory !== 'all') {
      filteredQuotes = filteredQuotes.filter(quote => quote.category === selectedCategory);
    }
    
    return filteredQuotes;
  };

  const handleSelectQuoteForNFT = (quote: AuthorizedQuote) => {
    // Przygotuj parametry URL
    const params = new URLSearchParams();
    params.set('quote', quote.content);
    if (!quote.isOwnQuote) {
      // Dla znanych cytatów, wyciągnij autora z treści (zakładając format "Treść - Autor")
      const authorMatch = quote.content.match(/ - (.+)$/);
      if (authorMatch) {
        params.set('author', authorMatch[1]);
      }
    }
    params.set('category', quote.category);
    
    // Przekieruj do strony quotes z parametrami
    router.push(`/quotes?${params.toString()}`);
  };

  const renderQuotesList = (quotes: AuthorizedQuote[]) => {
    const filteredQuotes = getFilteredQuotes(quotes);
    
    if (filteredQuotes.length === 0) {
      return (
        <div className={`p-4 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-black/20'}`}>
          <p className={`text-center ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
            No quotes in this category
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filteredQuotes.map((quote) => (
          <div
            key={quote.id}
            className={`p-4 rounded-lg border ${
              theme === 'light' 
                ? 'bg-white border-gray-200' 
                : 'bg-black/20 border-[#0052FF]/20'
            }`}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <p className={`text-lg mb-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                  {quote.content}
                </p>
                <div className={`text-sm space-y-1 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                  {quote.isOwnQuote ? (
                    <p>Own quote by user: {quote.submittedBy}</p>
                  ) : (
                    <p>Known quote added by: {quote.submittedBy}</p>
                  )}
                  <p>Category: {QUOTE_CATEGORIES[quote.category as keyof typeof QUOTE_CATEGORIES]}</p>
                  <p>Date: {new Date(quote.timestamp?.toDate()).toLocaleString()}</p>
                </div>
              </div>
              
              {selectedType === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus(quote.id!, 'approved')}
                    disabled={isUpdating}
                    className="px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(quote.id!, 'rejected')}
                    disabled={isUpdating}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (address?.toLowerCase() !== ADMIN_ADDRESS) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <p className={`text-lg ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
          Brak dostępu
        </p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full p-4 sm:p-6 lg:p-8 ${theme === 'light' ? 'bg-gray-100' : 'bg-[#0F172A]'}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className={`text-2xl font-bold font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            Quote Management
          </h1>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            {/* Quote type selector */}
            <select
              value={quoteType}
              onChange={(e) => setQuoteType(e.target.value as 'own' | 'known' | 'all')}
              className={`rounded-lg p-2 text-sm ${
                theme === 'light'
                  ? 'bg-white border-gray-200 text-gray-900'
                  : 'bg-black/20 border-[#0052FF]/20 text-white'
              }`}
            >
              <option value="all">All Quotes</option>
              <option value="own">Own Quotes</option>
              <option value="known">Known Quotes</option>
            </select>

            {/* Status selector */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'pending' | 'approved' | 'rejected' | 'all')}
              className={`rounded-lg p-2 text-sm ${
                theme === 'light'
                  ? 'bg-white border-gray-200 text-gray-900'
                  : 'bg-black/20 border-[#0052FF]/20 text-white'
              }`}
            >
              <option value="all">All ({pendingQuotes.length + approvedQuotes.length + rejectedQuotes.length})</option>
              <option value="pending">Pending ({pendingQuotes.length})</option>
              <option value="approved">Approved ({approvedQuotes.length})</option>
              <option value="rejected">Rejected ({rejectedQuotes.length})</option>
            </select>

            {/* Category selector */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`rounded-lg p-2 text-sm ${
                theme === 'light'
                  ? 'bg-white border-gray-200 text-gray-900'
                  : 'bg-black/20 border-[#0052FF]/20 text-white'
              }`}
            >
              <option value="all">All Categories</option>
              {Object.entries(QUOTE_CATEGORIES)
                .map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className={`text-lg ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              Loading...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {selectedType === 'pending' && renderQuotesList(pendingQuotes)}
            {selectedType === 'approved' && renderQuotesList(approvedQuotes)}
            {selectedType === 'rejected' && renderQuotesList(rejectedQuotes)}
            {selectedType === 'all' && (
              <>
                {pendingQuotes.length > 0 && (
                  <div>
                    <h2 className={`text-xl font-bold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                      Pending Quotes
                    </h2>
                    {renderQuotesList(pendingQuotes)}
                  </div>
                )}
                {approvedQuotes.length > 0 && (
                  <div>
                    <h2 className={`text-xl font-bold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                      Approved Quotes
                    </h2>
                    {renderQuotesList(approvedQuotes)}
                  </div>
                )}
                {rejectedQuotes.length > 0 && (
                  <div>
                    <h2 className={`text-xl font-bold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                      Rejected Quotes
                    </h2>
                    {renderQuotesList(rejectedQuotes)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 