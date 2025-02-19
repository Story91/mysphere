import { Quote } from './quotes-data';

export function categorizeQuote(quote: Quote): string[];
export function searchQuotes(quotes: Quote[], query: string): Quote[];
export function filterQuotesByCategory(quotes: Quote[], category: string): Quote[];
export function getRandomQuoteFromCategory(quotes: Quote[], category: string): Quote;
export function getCategoryStats(quotes: Quote[]): Record<string, number>;
export function getTopAuthors(quotes: Quote[]): string[];
export function analyzeLengthDistribution(quotes: Quote[]): Record<string, number>; 