# CDP Environment Variables Setup

## Important: Server-Side Only Configuration

CDP credentials must be stored in your `.env.local` file WITHOUT the `NEXT_PUBLIC_` prefix. This ensures they are only accessible on the server side and not exposed to the browser.

## Required Environment Variables

Create a `.env.local` file in your BaseBook directory with the following variables:

```env
# CDP (Coinbase Developer Platform) Configuration - Server Side Only!
# Get these from https://cdp.coinbase.com
CDP_API_KEY_ID=your_cdp_api_key_id_here
CDP_API_KEY_SECRET=your_cdp_api_key_secret_here
CDP_WALLET_SECRET=your_cdp_wallet_secret_here

# Network Configuration - Can be public
NEXT_PUBLIC_NETWORK_ID=base-sepolia
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org

# Optional: Paymaster URL for gasless transactions
PAYMASTER_URL=

# Your existing configuration
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_ZERODEV_PROJECT_ID=your_zerodev_project_id
```

## How to Get CDP Credentials

1. Go to https://cdp.coinbase.com
2. Create an account or log in
3. Create a new project
4. Go to API Keys section
5. Create a new API key
6. Copy the API Key ID, API Key Secret, and Wallet Secret

## Important Notes

- **NEVER** commit your `.env.local` file to git
- **NEVER** prefix CDP credentials with `NEXT_PUBLIC_` 
- CDP credentials are used only in server-side API routes
- The client-side hook communicates with these API routes

## Troubleshooting

If you're getting "Missing CDP credentials" errors:

1. Make sure your `.env.local` file exists
2. Verify the variable names are exactly as shown above (without NEXT_PUBLIC_ prefix)
3. Restart your Next.js development server after adding/changing env variables
4. Check that the values are not wrapped in extra quotes

## Security Best Practices

- Keep CDP credentials on the server side only
- Use the API routes we've created to interact with CDP
- Never expose raw CDP credentials to the client
- Regularly rotate your API keys
