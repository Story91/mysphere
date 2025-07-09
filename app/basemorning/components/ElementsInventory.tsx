import React, { useState, useEffect } from 'react';
import ElementsGrid from './ElementsGrid';

interface NFTElement {
  tokenId: string;
  name: string;
  image: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic';
  level: number;
  elementType: string;
  background_color: string;
}

interface ElementsInventoryProps {
  playerAddress: string;
  onElementSelect: (element: NFTElement) => void;
}

const ElementsInventory: React.FC<ElementsInventoryProps> = ({ 
  playerAddress, 
  onElementSelect 
}) => {
  const [elements, setElements] = useState<NFTElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Funkcja do pobierania metadanych z IPFS
  const fetchMetadata = async (tokenId: string, elementType: string, rarity: string) => {
    try {
      const metadataUrl = `https://gateway.pinata.cloud/ipfs/YOUR_IPFS_HASH/${elementType}_${rarity.toLowerCase()}.json`;
      
      const response = await fetch(metadataUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata for ${elementType} ${rarity}`);
      }
      
      const metadata = await response.json();
      return metadata;
    } catch (error) {
      console.error('Error fetching metadata:', error);
      return null;
    }
  };

  // Funkcja do pobierania elementów gracza z kontraktu
  const fetchPlayerElements = async () => {
    try {
      setLoading(true);
      setError(null);

      // Tutaj pobieram elementy z kontraktu - przykład:
      // const contract = new ethers.Contract(contractAddress, abi, provider);
      // const playerElements = await contract.getPlayerElements(playerAddress);
      
      // Przykładowe dane - zastąp prawdziwymi z kontraktu
      const mockPlayerElements = [
        { tokenId: "1", elementType: "reactor", rarity: "rare", level: 2 },
        { tokenId: "2", elementType: "storage", rarity: "common", level: 1 },
        { tokenId: "3", elementType: "defense_tower", rarity: "epic", level: 3 },
        { tokenId: "4", elementType: "living_module", rarity: "uncommon", level: 1 },
      ];

      // Pobierz metadane dla każdego elementu
      const elementsWithMetadata = await Promise.all(
        mockPlayerElements.map(async (element) => {
          const metadata = await fetchMetadata(element.tokenId, element.elementType, element.rarity);
          
          if (metadata) {
            return {
              tokenId: element.tokenId,
              name: metadata.name,
              image: metadata.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'),
              rarity: element.rarity.charAt(0).toUpperCase() + element.rarity.slice(1) as 'Common' | 'Uncommon' | 'Rare' | 'Epic',
              level: element.level,
              elementType: element.elementType,
              background_color: metadata.background_color
            };
          }
          
          return null;
        })
      );

      // Usuń null values
      const validElements = elementsWithMetadata.filter(Boolean) as NFTElement[];
      setElements(validElements);
      
    } catch (error) {
      console.error('Error fetching player elements:', error);
      setError('Failed to load your elements. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (playerAddress) {
      fetchPlayerElements();
    }
  }, [playerAddress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="ml-4 text-white">Loading your elements...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-8">
        <p>{error}</p>
        <button 
          onClick={fetchPlayerElements}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="inventory-container">
      <ElementsGrid
        elements={elements}
        onElementClick={onElementSelect}
        title="Your Element Collection"
      />
      
      {/* Statystyki kolekcji */}
      <div className="collection-stats">
        <div className="stat-item">
          <span className="stat-label">Total Elements:</span>
          <span className="stat-value">{elements.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Epic Elements:</span>
          <span className="stat-value">{elements.filter(e => e.rarity === 'Epic').length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Max Level:</span>
          <span className="stat-value">{Math.max(...elements.map(e => e.level), 0)}</span>
        </div>
      </div>
    </div>
  );
};

export default ElementsInventory;

// CSS do dołączenia do głównego pliku stylów
const inventoryStyles = `
.inventory-container {
  padding: 20px;
  background: linear-gradient(135deg, #0f1419 0%, #1a1a2e 100%);
  border-radius: 20px;
  margin: 20px 0;
}

.collection-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 30px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-item {
  text-align: center;
  color: white;
}

.stat-label {
  display: block;
  font-size: 14px;
  color: #cccccc;
  margin-bottom: 5px;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: bold;
  color: #00ff88;
  text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
}

@media (max-width: 768px) {
  .collection-stats {
    flex-direction: column;
    gap: 15px;
  }
}
`; 