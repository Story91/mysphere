/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
  },
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
