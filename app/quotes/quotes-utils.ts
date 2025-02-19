import { Quote } from './quotes-data';

// Funkcja do kategoryzacji cytatów
export function categorizeQuote(quote: Quote): string[] {
  const categories: string[] = [];
  const lowerText = quote.text.toLowerCase();

  // Theme categories
  if (lowerText.includes('love') || lowerText.includes('heart') || lowerText.includes('romance')) {
    categories.push('LOVE');
  }
  if (lowerText.includes('success') || lowerText.includes('achieve') || lowerText.includes('goal')) {
    categories.push('SUCCESS');
  }
  if (lowerText.includes('life') || lowerText.includes('live') || lowerText.includes('exist')) {
    categories.push('LIFE');
  }
  if (lowerText.includes('wisdom') || lowerText.includes('knowledge') || lowerText.includes('learn')) {
    categories.push('WISDOM');
  }
  if (lowerText.includes('friend') || lowerText.includes('relationship') || lowerText.includes('together')) {
    categories.push('FRIENDSHIP');
  }
  if (lowerText.includes('happy') || lowerText.includes('joy') || lowerText.includes('smile')) {
    categories.push('HAPPINESS');
  }
  if (lowerText.includes('motiv') || lowerText.includes('inspir') || lowerText.includes('dream')) {
    categories.push('MOTIVATION');
  }
  if (lowerText.includes('hope') || lowerText.includes('faith') || lowerText.includes('believe')) {
    categories.push('HOPE');
  }

  // If no category was assigned
  if (categories.length === 0) {
    categories.push('OTHER');
  }

  return categories;
}

// Funkcja do wyszukiwania cytatów
export function searchQuotes(quotes: Quote[], query: string): Quote[] {
  const lowerQuery = query.toLowerCase();
  return quotes.filter(quote => 
    quote.text.toLowerCase().includes(lowerQuery) ||
    quote.author.toLowerCase().includes(lowerQuery)
  );
}

// Funkcja do filtrowania cytatów po kategorii
export function filterQuotesByCategory(quotes: Quote[], category: string): Quote[] {
  return quotes.filter(quote => categorizeQuote(quote).includes(category));
}

// Funkcja do pobierania losowego cytatu z kategorii
export function getRandomQuoteFromCategory(quotes: Quote[], category: string): Quote | null {
  const categoryQuotes = filterQuotesByCategory(quotes, category);
  if (categoryQuotes.length === 0) return null;
  return categoryQuotes[Math.floor(Math.random() * categoryQuotes.length)];
}

// Funkcja do pobierania statystyk kategorii
export function getCategoryStats(quotes: Quote[]): Record<string, number> {
  const stats: Record<string, number> = {};
  quotes.forEach(quote => {
    const categories = categorizeQuote(quote);
    categories.forEach(category => {
      stats[category] = (stats[category] || 0) + 1;
    });
  });
  return stats;
}

// Funkcja do pobierania najpopularniejszych autorów
export function getTopAuthors(quotes: Quote[], limit: number = 10): { author: string; count: number }[] {
  const authorStats: Record<string, number> = {};
  quotes.forEach(quote => {
    authorStats[quote.author] = (authorStats[quote.author] || 0) + 1;
  });

  return Object.entries(authorStats)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Funkcja do analizy długości cytatów
export function analyzeLengthDistribution(quotes: Quote[]): Record<string, number> {
  return quotes.reduce((acc, quote) => {
    const length = quote.text.length;
    let category;
    if (length < 50) category = 'KRÓTKIE';
    else if (length < 150) category = 'ŚREDNIE';
    else category = 'DŁUGIE';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
} 