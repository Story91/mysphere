import type { MetadataRoute } from 'next';
import { getRecentPostRefs } from './utils/posts/getPostForShare';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { isRouteDisabled } from '@/config/routeStatus';

/**
 * Sitemapa.
 *
 * PO CO: kazdy post ma juz wlasny URL (/post/[id]) z metadanymi i karta OG, ale
 * nic o tych URL-ach nie mowilo wyszukiwarkom - do feedu prowadzil jeden link,
 * a caly dlugi ogon tresci byl niewidoczny. Bez sitemapy praca wlozona w trase
 * /post/[id] nie zamienia sie w ruch.
 *
 * Statyczne trasy filtrujemy przez isRouteDisabled, czyli przez te sama liste,
 * ktora generuje przekierowania w next.config.js. Sitemapa nie moze wiec
 * zaprosic crawlera na trase, ktora i tak go przekieruje.
 *
 * Rewalidacja co godzine - Firestore odpytujemy raz na godzine, nie przy kazdym
 * odwiedzeniu /sitemap.xml.
 */

export const revalidate = 3600;

const BASE_URL = 'https://mysphere.fun';

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
  { path: '/basechat', priority: 1, changeFrequency: 'daily' },
  { path: '/re-definition', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/leaderboard', priority: 0.8, changeFrequency: 'daily' },
  // /how i /curators sa jedynymi stronami, ktore ktos moze SZUKAC z zewnatrz:
  // pierwsza odpowiada "co da sie tu zrobic", druga jest publicznym zapisem
  // zmian prowizji i kuratorow w skarbcach Morpho na Base - czyli pytaniem,
  // ktore ludzie zadaja wyszukiwarce, a nie nam.
  { path: '/how', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/curators', priority: 0.7, changeFrequency: 'daily' },
  // Paragony (/tip/[txHash]) celowo NIE trafiaja do sitemapy: sa niezmienne i
  // istnieja po to, zeby ktos je WYSLAL, a nie zeby crawler je zindeksowal.
  { path: '/Docs', priority: 0.6, changeFrequency: 'monthly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.filter(
    (route) => !isRouteDisabled(route.path)
  ).map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const posts = await getRecentPostRefs(500);

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/post/${post.id}`,
    lastModified: new Date(post.timestamp),
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  return [...staticEntries, ...postEntries];
}
