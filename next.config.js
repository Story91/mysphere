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
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
    // Kompiluje bundle klienta i serwera rownolegle, w osobnych workerach.
    webpackBuildWorker: true,
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
      config.externals.push({
        'gcp-metadata': 'commonjs gcp-metadata',
        'mongodb': 'commonjs mongodb',
      });
    }

    return config;
  },
  async rewrites() {
    return [
      {
        source: '/flashblock/:path*',
        destination: 'https://base-is-10x-faster.vercel.app/:path*',
      },
      {
        source: '/docs/:path*',
        destination: '/Docs/:path*',
      },
    ];
  },
  async redirects() {
    return [
      // Trasy wylaczone na czas redefinicji MySphere. Lista zyje w
      // config/routeStatus.js - kod stron zostaje nietkniety w repo.
      // permanent: false, zeby przegladarki nie zapamietaly tego na stale.
      ...buildRedirects(),
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
