import type { MetadataRoute } from 'next';

/**
 * PO CO TO ISTNIEJE: aplikacja nie miala ani robots.txt, ani sitemapy, wiec
 * wyszukiwarki i crawlery modeli nie mialy zadnej wskazowki, ktore trasy sa
 * publiczna trescia, a ktore prywatnym panelem. Przy produkcie, ktorego cala
 * dystrybucja opiera sie na linkowaniu pojedynczych postow i profili, to byla
 * najtansza z mozliwych dziur do zalatania.
 *
 * Blokujemy wylacznie to, co albo wymaga sesji, albo jest maszynowym API -
 * indeksowanie tych tras nie daje nikomu nic, a zjada budzet crawla.
 */

const BASE_URL = 'https://mysphere.fun';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
