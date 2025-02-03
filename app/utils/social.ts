export interface SocialLinkResponse {
  success: boolean;
  username?: string;
  error?: string;
}

export const connectLens = async (address: string): Promise<SocialLinkResponse> => {
  try {
    // Check if address has a Lens profile
    const response = await fetch(`https://api.lens.dev/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query DefaultProfile {
            defaultProfile(request: { ethereumAddress: "${address}" }) {
              handle
            }
          }
        `
      })
    });

    const data = await response.json();
    const handle = data?.data?.defaultProfile?.handle;

    if (handle) {
      return { success: true, username: handle };
    } else {
      // If user doesn't have a profile, redirect to create one
      window.open('https://claim.lens.xyz', '_blank');
      return { success: false, error: 'No Lens profile found. Create a profile to connect.' };
    }
  } catch (error) {
    console.error('Error connecting to Lens:', error);
    return { success: false, error: 'Failed to connect to Lens Protocol' };
  }
}; 