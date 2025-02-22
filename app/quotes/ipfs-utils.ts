import axios from 'axios';

const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const PINATA_API_SECRET = process.env.NEXT_PUBLIC_PINATA_API_SECRET;

// Funkcja do uploadowania snapshota ramki NFT na IPFS
export const uploadToIPFS = async (
  imageBlob: Blob, 
  quote: string, 
  author: string, 
  tokenId: number,
  metadata_options: {
    // Style tekstu
    fontFamily: string;
    effect: string;
    
    // Kolory
    backgroundColor: string;
    fontColor: string;
    
    // Efekty
    textShadowEnabled: boolean;
    textShadowColor: { r: number; g: number; b: number };
    isShadowEnabled: boolean;
    shadowColor: { r: number; g: number; b: number };
    backdropOpacity: number;
    
    // Tło
    isCustomBackground: boolean;
    backgroundImage?: string;
    
    // Źródło cytatu
    quoteSource: 'AI' | 'MYSPHERE' | 'OWN' | 'KNOWN';
    category: string;
  }
): Promise<string> => {
  try {
    console.log('Starting upload with keys:', { 
      key: PINATA_API_KEY,
      secret: PINATA_API_SECRET?.substring(0, 5) + '...'
    });

    // Konwertuj blob na File
    const imageFile = new File([imageBlob], `quote-${tokenId}.png`, { type: 'image/png' });

    // Upload obrazu
    const imageFormData = new FormData();
    imageFormData.append('file', imageFile);

    console.log('Uploading image...');
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

    console.log('Image upload successful:', imageResponse.data);
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${imageResponse.data.IpfsHash}`;

    // Przygotowanie metadanych w formacie zgodnym z przykładem
    const metadata = {
      name: `MySphere #${tokenId}`,
      description: `${quote}${author ? ` — ${author}` : ''}`,
      image: imageUrl,
      attributes: [
        {
          trait_type: "Quote Source",
          value: metadata_options.quoteSource
        },
        {
          trait_type: "Category",
          value: metadata_options.category
        },
        {
          trait_type: "Quote",
          value: quote
        },
        {
          trait_type: "Author",
          value: author || "Anonymous"
        },
        {
          trait_type: "Quote Length",
          value: quote.length <= 50 ? "Short" : quote.length <= 100 ? "Medium" : "Long"
        },
        {
          trait_type: "Font Style",
          value: metadata_options.fontFamily
        },
        {
          trait_type: "Text Effect",
          value: metadata_options.effect
        },
        {
          trait_type: "Background Type",
          value: metadata_options.isCustomBackground ? "Custom Image" : "Solid Color"
        },
        {
          trait_type: "Background Color",
          value: metadata_options.isCustomBackground ? "N/A" : metadata_options.backgroundColor
        },
        {
          trait_type: "Font Color",
          value: metadata_options.fontColor
        },
        {
          trait_type: "Text Shadow",
          value: metadata_options.textShadowEnabled ? "Enabled" : "Disabled"
        },
        {
          trait_type: "Text Shadow Color",
          value: metadata_options.textShadowEnabled ? 
            `rgb(${metadata_options.textShadowColor.r},${metadata_options.textShadowColor.g},${metadata_options.textShadowColor.b})` : 
            "N/A"
        },
        {
          trait_type: "Backdrop Effect",
          value: metadata_options.isShadowEnabled ? "Enabled" : "Disabled"
        },
        {
          trait_type: "Backdrop Color",
          value: metadata_options.isShadowEnabled ? 
            `rgb(${metadata_options.shadowColor.r},${metadata_options.shadowColor.g},${metadata_options.shadowColor.b})` : 
            "N/A"
        },
        {
          trait_type: "Backdrop Opacity",
          value: metadata_options.isShadowEnabled ? 
            `${Math.round(metadata_options.backdropOpacity * 100)}%` : 
            "N/A"
        },
        {
          display_type: "number",
          trait_type: "Generation",
          value: tokenId
        }
      ]
    };

    console.log('Preparing metadata:', metadata);

    // Wysyłamy metadane bezpośrednio jako JSON z nazwą pliku
    console.log('Uploading metadata...');
    const metadataResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `metadata-${tokenId}.json`
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET,
        },
      }
    );

    console.log('Metadata upload successful:', metadataResponse.data);
    return `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`;
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
      console.error('Request headers:', error.config?.headers);
      console.error('Full error response:', error.response);
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