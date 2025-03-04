# FlashBlock Demo

A demonstration of FlashBlock technology on Base Sepolia, showcasing ultra-fast transaction confirmations.

## Features

- Real-time visualization of FlashBlock vs Standard Block speeds
- Transaction speed comparison (FlashBlock: 200ms vs Standard: 2000ms)
- WebSocket connection to FlashBlock endpoint
- Interactive transaction testing interface
- Wallet integration with Coinbase Wallet

## Technology Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Coinbase OnchainKit
- Wagmi

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- A wallet with Base Sepolia testnet ETH

### Installation

1. Clone the repository
```bash
git clone https://github.com/your-username/FlashBlock.git
cd FlashBlock
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Start the development server
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## FlashBlock API Endpoints

- WebSocket: `wss://sepolia.flashblocks.base.org/ws`
- RPC Endpoint: `https://sepolia-preconf.base.org`

## Deployment

This project can be easily deployed to Vercel:

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Deploy with default settings

## License

MIT