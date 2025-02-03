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
      domains: ['basebook.vercel.app', 'firebasestorage.googleapis.com']
    }
  };
  
  export default nextConfig;
  