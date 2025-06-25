# MySphere × Camp Network Integration

This directory contains the Camp Network integration for MySphere, enabling seamless Web2 to Web3 social identity bridging.

## 📁 Structure

```
/mycamp/
├── page.tsx                    # Main integration page
├── components/
│   └── SocialLinksManager.tsx  # Social media management component
├── twitter/
│   └── page.tsx               # Twitter OAuth callback
├── spotify/
│   └── page.tsx               # Spotify OAuth callback
├── discord/
│   └── page.tsx               # Discord OAuth callback
└── README.md                  # This file
```

## 🔧 Setup & Configuration

### 1. Environment Variables

Add these to your `.env.local` file:

```bash
# Backend only (secure)
CAMP_API_KEY=d77f0d1c-a29a-46b1-a02c-5447d489070f
CAMP_CLIENT_ID=6a886b9d-e637-49ab-8c06-a66a20b7a778

# Frontend (public)
NEXT_PUBLIC_CAMP_CLIENT_ID=6a886b9d-e637-49ab-8c06-a66a20b7a778
NEXT_PUBLIC_CAMP_FAUCET_URL=https://faucet.campnetwork.xyz/
NEXT_PUBLIC_CAMP_EXPLORER_URL=https://basecamp.cloud.blockscout.com/
```

### 2. CampProvider Configuration

The `CampProvider` is configured in `/app/providers.tsx` with:
- Client ID from environment variables
- Redirect URI set to `/mycamp` for OAuth callbacks

### 3. Camp Network URLs

- **Faucet**: https://faucet.campnetwork.xyz/
- **Explorer**: https://basecamp.cloud.blockscout.com/

## 🚀 Features

### Main Integration Page (`/mycamp`)
- **Authentication**: Connect/disconnect from Camp Network
- **Social Management**: Link/unlink Twitter, Spotify, Discord
- **Network Stats**: Display Camp Network statistics
- **Tools Access**: Direct links to faucet and explorer

### Social Media Integration
- **Twitter**: OAuth integration for Twitter accounts
- **Spotify**: OAuth integration for Spotify accounts  
- **Discord**: OAuth integration for Discord accounts
- **Callback Handling**: Dedicated callback pages for each platform

### Components

#### SocialLinksManager
- Real-time social connection status
- Individual link/unlink buttons for each platform
- Animated UI with status indicators
- Error handling and loading states

#### Callback Pages
- Twitter, Spotify, Discord callback handlers
- Success/error status display
- Automatic redirect back to main page
- Consistent UI design across all platforms

## 🎯 Camp Network SDK Usage

### Hooks Used
- `useAuth()` - Authentication management
- `useAuthState()` - Authentication state monitoring
- `useSocials()` - Social accounts data
- `useLinkSocials()` - Social linking/unlinking functions

### Components Used
- `CampModal` - Official Camp Network modal for authentication and social management
- `CampProvider` - Context provider for Camp Network SDK

## 🔗 OAuth Flow

1. User clicks "Link" button for a social platform
2. Camp SDK initiates OAuth flow
3. User authenticates with social platform
4. Platform redirects to callback URL (`/mycamp/{platform}`)
5. Callback page processes the result
6. User is redirected back to main page
7. Social status is updated in real-time

## 🛠️ Development

### Testing Social Links
1. Connect to Camp Network using the main button
2. Use individual platform buttons to test linking
3. Check callback pages for proper error handling
4. Verify social status updates in real-time

### Debugging
- Console logs are available for authentication state
- Social data is logged when updated
- Error handling in callback pages

## 📚 Camp Network Documentation

- [Camp Network SDK](https://github.com/campnetwork/camp-sdk)
- [React SDK Documentation](https://docs.campnetwork.xyz/sdk/react)
- [Authentication Guide](https://docs.campnetwork.xyz/authentication)

## 🔐 Security Notes

- API keys are stored securely in environment variables
- Backend routes handle sensitive operations
- Frontend only uses public configuration
- OAuth callbacks include proper error handling 