import axios from 'axios';

const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const PINATA_API_SECRET = process.env.NEXT_PUBLIC_PINATA_API_SECRET;

// Funkcja do uploadowania snapshota ramki NFT na IPFS
export const uploadToIPFS = async (imageBlob: Blob, quote: string, author: string, tokenId: number): Promise<string> => {
  try {
    console.log('Using Pinata keys:', { 
      key: PINATA_API_KEY, 
      secret: PINATA_API_SECRET?.substring(0, 5) + '...' 
    });

    // Konwertuj blob na File
    const imageFile = new File([imageBlob], `quote-${tokenId}.png`, { type: 'image/png' });

    // Upload obrazu
    const imageFormData = new FormData();
    imageFormData.append('file', imageFile);

    const imageResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      imageFormData,
      {
        maxBodyLength: Infinity,
        headers: {
          'Content-Type': 'multipart/form-data',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET,
        },
      }
    );

    console.log('Image upload response:', imageResponse.data);
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${imageResponse.data.IpfsHash}`;

    // Przygotowanie metadanych w formacie zgodnym z przykładem
    const metadata = {
      name: `MySphere #${tokenId}`,
      description: `${quote}${author ? ` — ${author}` : ''}`,
      image: imageUrl
    };

    // Tworzenie pliku JSON z metadanymi
    const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    const metadataFile = new File([metadataBlob], `metadata-${tokenId}.json`, { type: 'application/json' });
    const metadataFormData = new FormData();
    metadataFormData.append('file', metadataFile);

    const metadataResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      metadataFormData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET,
        },
      }
    );

    console.log('Metadata upload response:', metadataResponse.data);
    return `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`;
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
      console.error('Request headers:', error.config?.headers);
    }
    throw error;
  }
};

// Funkcja do uploadowania metadanych na IPFS
export const uploadMetadataToIPFS = async (imageUrl: string, quote: string, author: string): Promise<string> => {
  const metadata = {
    name: "MySphere NFT",
    description: `${quote}${author ? ` - ${author}` : ''}`,
    image: imageUrl,
    attributes: [
      {
        trait_type: "Quote",
        value: quote
      },
      {
        trait_type: "Author",
        value: author || "Anonymous"
      }
    ]
  };

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      metadata,
      {
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET,
        },
      }
    );

    console.log('Metadata upload response:', response.data);
    return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
  } catch (error) {
    console.error('Error uploading metadata to IPFS:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
      console.error('Request headers:', error.config?.headers);
    }
    throw error;
  }
}; 