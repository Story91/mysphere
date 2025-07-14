/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
      serverComponentsExternalPackages: ['mongodb'],
    },
    // Silence warnings
    // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
    webpack: (config, { isServer }) => {
      // From .mjs
      config.externals.push('pino-pretty', 'lokijs', 'encoding');

      // From .js
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
  
      config.externals = config.externals || [];
      if (isServer) {
        config.externals.push({
          'gcp-metadata': 'commonjs gcp-metadata',
          'mongodb': 'commonjs mongodb',
        });
      }

      return config;
    },
    typescript: {
      ignoreBuildErrors: true
    },
    eslint: {
      ignoreDuringBuilds: true
    },
    images: {
      unoptimized: true,
      domains: ['basebook.vercel.app', 'firebasestorage.googleapis.com', 'mysphere.fun']
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
        {
          source: '//:path*',
          has: [
            {
              type: 'host',
              value: 'www.mysphere.fun',
            },
          ],
          destination: 'https://mysphere.fun/:path*',
          permanent: true,
        },
        {
          source: '/:path*',
          has: [
            {
              type: 'header',
              key: 'x-forwarded-proto',
              value: 'http',
            },
          ],
          destination: 'https://mysphere.fun/:path*',
          permanent: true,
        }
      ];
    }
  };
  
  export default nextConfig;
  