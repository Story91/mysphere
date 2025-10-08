const ROOT_URL = process.env.NEXT_PUBLIC_URL || "https://mysphere.fun";

export const minikitConfig = {
  accountAssociation: {
    header: process.env.FARCASTER_HEADER || "",
    payload: process.env.FARCASTER_PAYLOAD || "",
    signature: process.env.FARCASTER_SIGNATURE || "",
  },
  miniapp: {
    version: "1",
    name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "MySphere",
    subtitle: process.env.NEXT_PUBLIC_APP_SUBTITLE || "Build and own your Sphere",
    description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Create tokenize and monetize content on Base while building your onchain reputation with the Web3 social platform for builders and creators",
    screenshotUrls: process.env.NEXT_PUBLIC_APP_SCREENSHOTS 
      ? process.env.NEXT_PUBLIC_APP_SCREENSHOTS.split(',').map(url => url.trim())
      : [`${ROOT_URL}/frame-v2.png`, `${ROOT_URL}/SphereWhite.png`],
    iconUrl: process.env.NEXT_PUBLIC_APP_ICON || `${ROOT_URL}/android-chrome-512x512.png`,
    splashImageUrl: process.env.NEXT_PUBLIC_APP_SPLASH_IMAGE || `${ROOT_URL}/SphereWhite.png`,
    splashBackgroundColor: process.env.NEXT_PUBLIC_SPLASH_BACKGROUND_COLOR || "#050B20",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: process.env.NEXT_PUBLIC_APP_PRIMARY_CATEGORY || "social",
    tags: process.env.NEXT_PUBLIC_APP_TAGS 
      ? process.env.NEXT_PUBLIC_APP_TAGS.split(',').map(tag => tag.trim())
      : ["web3", "base", "social", "onchain", "creator"],
    heroImageUrl: process.env.NEXT_PUBLIC_APP_HERO_IMAGE || `${ROOT_URL}/frame-v2.png`,
    tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || "Onchain social on Base",
    ogTitle: process.env.NEXT_PUBLIC_APP_OG_TITLE || "MySphere - Social on Base",
    ogDescription: process.env.NEXT_PUBLIC_APP_OG_DESCRIPTION || "Build and own your digital Sphere. Create and monetize content on Base.",
    ogImageUrl: process.env.NEXT_PUBLIC_APP_OG_IMAGE || `${ROOT_URL}/frame-v2.png`,
  },
  baseBuilder: {
    allowedAddresses: ["0x5B9Db509BdA743DE9FF52C8049EFa92FEdD29126"]
  },
} as const;

