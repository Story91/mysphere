'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTheme } from '@/app/context/ThemeContext';
import { 
  AuthorizedQuote,
  getPendingQuotes, 
  updateQuoteStatus,
  ADMIN_ADDRESS,
  db
} from '@/app/utils/firebase';
import { collection, query, orderBy, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

// Kategorie cytatów
const QUOTE_CATEGORIES = {
  CUSTOM: 'Własny',
  LOVE: 'Miłość',
  SUCCESS: 'Sukces',
  LIFE: 'Życie',
  WISDOM: 'Mądrość',
  FRIENDSHIP: 'Przyjaźń',
  HAPPINESS: 'Szczęście',
  MOTIVATION: 'Motywacja',
  HOPE: 'Nadzieja',
  OTHER: 'Inne',
  CRYPTO: 'Krypto',
  BASE: 'Base',
  AI: 'AI',
  TECHNOLOGY: 'Technologia',
  INNOVATION: 'Innowacja'
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
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchQuotes = async () => {
      if (address?.toLowerCase() !== ADMIN_ADDRESS) return;
      
      try {
        setIsLoading(true);
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

        setPendingQuotes(allQuotes.filter(quote => quote.status === 'pending'));
        setApprovedQuotes(allQuotes.filter(quote => quote.status === 'approved'));
        setRejectedQuotes(allQuotes.filter(quote => quote.status === 'rejected'));
      } catch (error) {
        console.error('Error fetching quotes:', error);
        alert('Błąd podczas pobierania cytatów. Spróbuj ponownie.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotes();
  }, [address]);

  const handleUpdateStatus = async (quoteId: string, status: 'approved' | 'rejected') => {
    if (address?.toLowerCase() !== ADMIN_ADDRESS) {
      alert('Tylko administrator może aktualizować status cytatów');
      return;
    }

    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      await updateQuoteStatus(quoteId, status);
      
      const updatedQuote = pendingQuotes.find(q => q.id === quoteId);
      if (updatedQuote) {
        setPendingQuotes(prev => prev.filter(q => q.id !== quoteId));
        if (status === 'approved') {
          setApprovedQuotes(prev => [{ ...updatedQuote, status }, ...prev]);
        } else {
          setRejectedQuotes(prev => [{ ...updatedQuote, status }, ...prev]);
        }
      }
      
      alert(`Cytat został ${status === 'approved' ? 'zatwierdzony' : 'odrzucony'}`);
    } catch (error) {
      console.error('Error updating quote status:', error);
      alert('Błąd podczas aktualizacji statusu cytatu. Spróbuj ponownie.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten cytat?')) return;

    try {
      const quoteRef = doc(db, 'authorizedQuotes', quoteId);
      await deleteDoc(quoteRef);
      
      setPendingQuotes(prev => prev.filter(q => q.id !== quoteId));
      setApprovedQuotes(prev => prev.filter(q => q.id !== quoteId));
      setRejectedQuotes(prev => prev.filter(q => q.id !== quoteId));
      
      alert('Cytat został usunięty');
    } catch (error) {
      console.error('Error deleting quote:', error);
      alert('Błąd podczas usuwania cytatu. Spróbuj ponownie.');
    }
  };

  const handleDeleteAllQuotes = async () => {
    if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE cytaty? Tej operacji nie można cofnąć!')) return;
    
    setIsDeletingAll(true);
    try {
      const quotesRef = collection(db, 'authorizedQuotes');
      const snapshot = await getDocs(quotesRef);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      setPendingQuotes([]);
      setApprovedQuotes([]);
      setRejectedQuotes([]);
      
      alert('Wszystkie cytaty zostały usunięte');
    } catch (error) {
      console.error('Error deleting all quotes:', error);
      alert('Błąd podczas usuwania wszystkich cytatów. Spróbuj ponownie.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const getFilteredQuotes = (quotes: AuthorizedQuote[]) => {
    let filteredQuotes = quotes;
    
    if (quoteType !== 'all') {
      filteredQuotes = filteredQuotes.filter(quote => 
        quoteType === 'own' ? quote.isOwnQuote : !quote.isOwnQuote
      );
    }
    
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
        <div className="text-center py-8">
          <p className="text-gray-400">Brak cytatów w tej kategorii</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filteredQuotes.map((quote) => (
          <div
            key={quote.id}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]"
          >
            <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-white text-lg mb-2">{quote.content}</p>
                    <div className="space-y-1 text-sm text-gray-400">
                      <p>Autor: {quote.submittedBy}</p>
                      <p>Kategoria: {QUOTE_CATEGORIES[quote.category as keyof typeof QUOTE_CATEGORIES]}</p>
                      <p>Data: {quote.timestamp?.toDate().toLocaleString()}</p>
                      <div className="flex gap-2 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          quote.isOwnQuote 
                            ? 'bg-[#FF00A8]/20 text-[#FF00A8]' 
                            : 'bg-[#0052FF]/20 text-[#0052FF]'
                        }`}>
                          {quote.isOwnQuote ? 'Własny cytat' : 'Znany cytat'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          quote.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-500'
                            : quote.status === 'approved'
                            ? 'bg-green-500/20 text-green-500'
                            : 'bg-red-500/20 text-red-500'
                        }`}>
                          {quote.status === 'pending' ? 'Oczekujący' : quote.status === 'approved' ? 'Zatwierdzony' : 'Odrzucony'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {quote.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(quote.id!, 'approved')}
                          disabled={isUpdating}
                          className="px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Zatwierdź
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(quote.id!, 'rejected')}
                          disabled={isUpdating}
                          className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Odrzuć
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteQuote(quote.id!)}
                      className="px-4 py-2 rounded-lg bg-red-900 text-white font-medium hover:bg-red-800 transition-colors"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (address?.toLowerCase() !== ADMIN_ADDRESS) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <p className="text-white text-lg">Brak dostępu</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full p-4 sm:p-6 lg:p-8 bg-[#0F172A]">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header z tytułem i statystykami */}
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
            <div className="relative rounded-[10px] bg-black/90 px-6 py-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-2">Panel Zarządzania Cytatami</h1>
                  <div className="flex gap-4 text-sm">
                    <span className="text-[#0052FF]">Oczekujące: {pendingQuotes.length}</span>
                    <span className="text-green-500">Zatwierdzone: {approvedQuotes.length}</span>
                    <span className="text-red-500">Odrzucone: {rejectedQuotes.length}</span>
                  </div>
                </div>
                <button
                  onClick={handleDeleteAllQuotes}
                  disabled={isDeletingAll}
                  className="px-4 py-2 rounded-lg bg-red-900 text-white font-medium hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingAll ? 'Usuwanie...' : 'Usuń wszystkie cytaty'}
                </button>
              </div>
            </div>
          </div>

          {/* Filtry */}
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px]">
            <div className="relative rounded-[10px] bg-black/90 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <select
                  value={quoteType}
                  onChange={(e) => setQuoteType(e.target.value as 'own' | 'known' | 'all')}
                  className="rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#FF00A8]"
                >
                  <option value="all">Wszystkie cytaty</option>
                  <option value="own">Własne cytaty</option>
                  <option value="known">Znane cytaty</option>
                </select>

                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as 'pending' | 'approved' | 'rejected' | 'all')}
                  className="rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#FF00A8]"
                >
                  <option value="all">Wszystkie statusy</option>
                  <option value="pending">Oczekujące ({pendingQuotes.length})</option>
                  <option value="approved">Zatwierdzone ({approvedQuotes.length})</option>
                  <option value="rejected">Odrzucone ({rejectedQuotes.length})</option>
                </select>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#FF00A8]"
                >
                  <option value="all">Wszystkie kategorie</option>
                  {Object.entries(QUOTE_CATEGORIES).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Lista cytatów */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0052FF]"></div>
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
                      <h2 className="text-xl font-bold text-white mb-4">Cytaty oczekujące</h2>
                      {renderQuotesList(pendingQuotes)}
                    </div>
                  )}
                  {approvedQuotes.length > 0 && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-4">Cytaty zatwierdzone</h2>
                      {renderQuotesList(approvedQuotes)}
                    </div>
                  )}
                  {rejectedQuotes.length > 0 && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-4">Cytaty odrzucone</h2>
                      {renderQuotesList(rejectedQuotes)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 