/** @type {import('next').NextConfig} */
const nextConfig = {
    // Silence warnings
    // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
    webpack: (config) => {
      config.externals.push('pino-pretty', 'lokijs', 'encoding');
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
    async redirects() {
      return [
        {
          source: '/',
          destination: '/basechat',
          permanent: true,
        },
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
  