const { buildRedirects } = require('./config/routeStatus');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pozwala zbudowac projekt bez nadpisywania .next uzywanego przez dzialajacy
  // `next dev`. Bez tego oba procesy niszcza sobie nawzajem cache i produkcyjny
  // build wywala sie na "Cannot find module './vendor-chunks/...'".
  // Uzycie: NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  swcMinify: true,
  trailingSlash: true,

  // ===========================================================================
  // BEZ TEGO ZADEN OBRAZEK PODGLADU NIE DZIALA NA X, FACEBOOKU ANI SLACKU
  // ===========================================================================
  // `trailingSlash: true` przekierowuje KAZDA sciezke bez ukosnika na wersje
  // z ukosnikiem. Dotyczy to takze tras generujacych obrazki Open Graph -
  // a Next wypisuje je w znaczniku BEZ ukosnika:
  //
  //     <meta property="og:image" content=".../opengraph-image?e51d61f5...">
  //
  // Zmierzone na produkcji:
  //     /opengraph-image           -> 308, text/plain, 15 bajtow
  //     /opengraph-image/          -> 200, image/png, 37 125 bajtow
  //
  // Crawler pobierajacy SAM OBRAZEK nie idzie za przekierowaniem tak, jak robi
  // to przy stronie - dostaje 308 i rezygnuje. Skutek: link do MySphere na X
  // wychodzil bez miniatury, mimo ze wszystkie znaczniki byly poprawne,
  // obrazek sie generowal, a walidator strony pokazywal komplet metadanych.
  // Blad byl niewidoczny w kazdym miejscu poza faktycznym udostepnieniem.
  //
  // Dotyczylo to WSZYSTKICH PIECIU tras z wlasna karta (strona glowna,
  // /leaderboard, /post/[id], /tip/[txHash], /u/[address]).
  //
  // `skipTrailingSlashRedirect` wylacza samo PRZEKIEROWANIE, nie zmieniajac
  // tego, jak Next generuje odnosniki - linki dalej dostaja ukosnik, a adres
  // bez ukosnika przestaje odbijac sie 308 i jest obslugiwany od razu.
  // Wybrane zamiast recznego nadpisywania `openGraph.images` w pieciu plikach,
  // bo metadane z konwencji plikowej (opengraph-image.tsx) maja w Next
  // pierwszenstwo nad wpisem w konfiguracji - takie nadpisanie po cichu nie
  // zadzialaloby, czyli byloby poprawka wygladajaca na zrobiona.
  skipTrailingSlashRedirect: true,

  images: {
    unoptimized: true,
  },
  experimental: {
    // firebase-admin MUSI byc tutaj, a nie w config.externals ponizej.
    //
    // Objaw, ktory to naprawia: /api/auth/verify, /api/auth/session i
    // /api/premium zwracaly na produkcji 500 w postaci strony HTML - czyli
    // wybuchaly przy ladowaniu modulu, zanim handler wystartowal. /api/auth/nonce,
    // jedyna z tych tras nieimportujaca firebaseAdmin, dzialala. Skutek: cale
    // logowanie SIWE bylo martwe na produkcji ("Server sign-in is not configured
    // yet"), mimo poprawnie ustawionych zmiennych srodowiskowych.
    //
    // Przyczyna: `config.externals.push({'gcp-metadata': 'commonjs gcp-metadata'})`
    // wypychalo tranzytywna zaleznosc firebase-admin (przez google-auth-library)
    // poza bundle, ALE recznie dopisany external omija sledzenie plikow Vercela
    // (@vercel/nft). Pakiet nie trafial do bundle'a funkcji, wiec require w
    // runtime rzucal MODULE_NOT_FOUND. Lokalnie bylo niewidoczne, bo tam caly
    // node_modules lezy na dysku.
    //
    // serverComponentsExternalPackages robi jedno i drugie naraz: zostawia
    // pakiet niezbundlowany I kaze go sledzic, wiec laduje w funkcji.
    serverComponentsExternalPackages: ['mongodb', 'firebase-admin'],
    // Kompiluje bundle klienta i serwera rownolegle, w osobnych workerach.
    webpackBuildWorker: true,
    // Dolacza tla kart OG (public/backs/*) do bundla funkcji opengraph-image,
    // zeby loadOgBg czytal je z DYSKU (fs), a nie pobieral po sieci - serwerowy
    // fetch wlasnej domeny na Vercelu bywa zawodny (fall back na fetch zostaje).
    outputFileTracingIncludes: {
      '/asks/opengraph-image': ['./public/backs/**'],
      '/money/opengraph-image': ['./public/backs/**'],
      '/how/opengraph-image': ['./public/backs/**'],
      '/startpad/opengraph-image': ['./public/backs/**'],
      '/re-definition/opengraph-image': ['./public/backs/**'],
      '/Docs/opengraph-image': ['./public/backs/**'],
    },
    // Pakiety z barrel files (index re-eksportujacy setki modulow). Bez tego
    // webpack musi przejsc caly barrel, zeby wyciagnac jeden import.
    // Lista wylacznie z tego, co faktycznie jest w repo.
    optimizePackageImports: [
      'framer-motion',
      'lucide-react',
      'react-icons',
      'recharts',
      '@heroicons/react',
      'date-fns',
    ],
  },
  // UWAGA: NIE wlaczac `next dev --turbo`. Turbopack w Next 14.2 calkowicie
  // ignoruje ponizsza funkcje webpack(), a ten projekt zalezy od niej w dwoch
  // miejscach: externals (pino-pretty/lokijs/encoding) oraz ~20 wpisow
  // resolve.fallback ustawionych na false. Bez nich SDK portfeli (m.in. MetaMask)
  // probuja rozwiazac wbudowane moduly Node'a w przegladarce i dev wywala sie
  // na module-not-found. Turbopack sygnalizuje to tylko ostrzezeniem
  // "Webpack is configured while Turbopack is not".
  webpack: (config, { isServer }) => {
    // WalletConnect optional deps that break client bundling
    // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
    config.externals = config.externals || [];
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        dns: false,
        child_process: false,
        tls: false,
        os: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        url: false,
        querystring: false,
        http: false,
        https: false,
        zlib: false,
        buffer: false,
        assert: false,
        events: false,
      };
    }

    // Handle MongoDB and other Node.js specific modules
    if (isServer) {
      // gcp-metadata USUNIETE stad celowo - patrz komentarz przy
      // serverComponentsExternalPackages. Recznie dopisany external omija
      // sledzenie plikow Vercela, wiec pakiet nie trafial do bundle'a funkcji
      // i firebase-admin wywracal sie przy imporcie na produkcji.
      config.externals.push({
        'mongodb': 'commonjs mongodb',
      });
    }

    // Pliki .md dokumentacji importujemy jako surowy string (asset/source),
    // zeby tresc zyla w plikach markdown obok kodu, a nie w escape'owanych
    // literalach TS (blok ```mermaid ma potrojne backticki). Dotyczy WYLACZNIE
    // plikow .md faktycznie zaimportowanych - reszta drzewa bez zmian.
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' });

    return config;
  },
  async rewrites() {
    // Byl tu proxy /flashblock/* na zewnetrzna appke. Zero uzyc w kodzie,
    // a kazde trafienie (takze botow) szlo przez nasz egress - usuniety.
    return [];
  },
  async redirects() {
    return [
      // Trasy wylaczone na czas redefinicji MySphere. Lista zyje w
      // config/routeStatus.js - kod stron zostaje nietkniety w repo.
      // permanent: false, zeby przegladarki nie zapamietaly tego na stale.
      // MySphere === BaseChat. Wczesniej app/page.tsx renderowal null i robil
      // router.replace w useEffect - czyli pusty ekran, potem skok. Serwerowe
      // przekierowanie jest natychmiastowe i nie wymaga zaladowania JS-a.
      { source: '/', destination: '/basechat', permanent: false },
      // === NIE DODAWAJ TU REGULY /docs -> /Docs ===
      // Byly tu kolejno rewrite i redirect z malych liter na kanoniczne /Docs.
      // OBIE zapetlaly sie na smierc, bo matcher regul Next.js dopasowuje
      // sciezke BEZ uwzgledniania wielkosci liter. Przy `trailingSlash: true`
      // wygladalo to tak:
      //
      //   /Docs   --308 (kanonizacja slasha)-->  /Docs/
      //   /Docs/  --307 (bo pasuje do '/docs')-->  /Docs
      //   ...i tak w kolko
      //
      // Zmierzone: curl przerywal po 12 przekierowaniach, przegladarka
      // pokazywala ERR_TOO_MANY_REDIRECTS. Cala dokumentacja razem z
      // whitepaperem byla nieosiagalna - takze lokalnie, wiec poprzedni
      // komentarz obwiniajacy Vercela byl bledna diagnoza.
      //
      // Regula jest nie tylko szkodliwa, ale i zbedna: skoro matcher ignoruje
      // wielkosc liter, /docs/ i tak trafia w te sama trase co /Docs/.
      ...buildRedirects(),
      // Startpad mieszkal pod /launchpad do 2026-08-10. Stare linki (posty,
      // PR-y, zakladki) maja dalej trafiac na strone, nie w 404. Zrodlo i cel
      // roznia sie caly czas, wiec pulapka petli z /Docs tu nie wystepuje.
      { source: '/launchpad', destination: '/startpad', permanent: false },
      { source: '/launchpad/:path*', destination: '/startpad/:path*', permanent: false },
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.mysphere.fun',
          },
        ],
        destination: 'https://mysphere.fun/:path*',
        permanent: true,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
