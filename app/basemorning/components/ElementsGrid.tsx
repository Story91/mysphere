import React from 'react';
import ElementCard from './ElementCard';

interface Element {
  tokenId: string;
  name: string;
  image: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic';
  level: number;
  elementType: string;
  background_color: string;
}

interface ElementsGridProps {
  elements: Element[];
  onElementClick: (element: Element) => void;
  title?: string;
}

const ElementsGrid: React.FC<ElementsGridProps> = ({ 
  elements, 
  onElementClick, 
  title = "Your Elements" 
}) => {
  return (
    <div className="elements-grid-container">
      <h2 className="grid-title">{title}</h2>
      
      <div className="elements-grid">
        {elements.map((element) => (
          <ElementCard
            key={element.tokenId}
            element={element}
            onClick={() => onElementClick(element)}
          />
        ))}
      </div>
      
      {elements.length === 0 && (
        <div className="empty-grid">
          <p>No elements found. Start your adventure!</p>
        </div>
      )}
    </div>
  );
};

export default ElementsGrid;

// Styl CSS do dołączenia do głównego CSS
const gridStyles = `
.elements-grid-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.grid-title {
  text-align: center;
  color: #ffffff;
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 30px;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.elements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
  padding: 20px;
}

.empty-grid {
  text-align: center;
  color: #cccccc;
  font-size: 16px;
  padding: 50px;
  border: 2px dashed #444444;
  border-radius: 15px;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .elements-grid {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 15px;
    padding: 15px;
  }
  
  .grid-title {
    font-size: 24px;
  }
}
`; 