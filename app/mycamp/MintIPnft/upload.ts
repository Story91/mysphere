
export async function uploadToIPFS(file: File): Promise<string> {
  try {
    const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT_TOKEN;
    if (!PINATA_JWT) {
      throw new Error('Missing Pinata JWT. Set NEXT_PUBLIC_PINATA_JWT in your .env.local');
    }

    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`
      },
      body: formData
    });

    const result = await response.json();
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;

    if (!ipfsUrl) {
      throw new Error("Failed to get IPFS URL after upload");
    }

    console.log("File uploaded to IPFS successfully!", ipfsUrl);

    return ipfsUrl;
  } catch (error) {
    console.error("IPFS upload error:", error);
    throw error;
  }
} 