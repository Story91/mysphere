import React from 'react';
import './ElementCard.css';

interface ElementCardProps {
  element: {
    tokenId: string;
    name: string;
    image: string;
    rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic';
    level: number;
    elementType: string;
    background_color: string;
  };
  onClick?: () => void;
}

const ElementCard: React.FC<ElementCardProps> = ({ element, onClick }) => {
  // Intensywność świecenia na podstawie rarity
  const getGlowIntensity = (rarity: string) => {
    switch (rarity) {
      case 'Epic': return 20;
      case 'Rare': return 15;
      case 'Uncommon': return 10;
      case 'Common': return 5;
      default: return 5;
    }
  };

  // Styl z dynamicznym kolorem świecenia
  const cardStyle = {
    '--glow-color': `#${element.background_color}`,
    '--glow-intensity': `${getGlowIntensity(element.rarity)}px`,
    '--rarity-opacity': element.rarity === 'Epic' ? '0.8' : 
                       element.rarity === 'Rare' ? '0.6' : 
                       element.rarity === 'Uncommon' ? '0.4' : '0.2'
  } as React.CSSProperties;

  return (
    <div 
      className={`element-card rarity-${element.rarity.toLowerCase()}`}
      style={cardStyle}
      onClick={onClick}
    >
      {/* Poziom elementu */}
      <div className="element-level">
        LVL {element.level}
      </div>
      
      {/* Główny obrazek NFT */}
      <div className="element-image-container">
        <img 
          src={element.image} 
          alt={element.name}
          className="element-image"
        />
        
        {/* Overlay z efektem świecenia */}
        <div className="glow-overlay"></div>
      </div>
      
      {/* Informacje o elemencie */}
      <div className="element-info">
        <h3 className="element-name">{element.name}</h3>
        <p className="element-type">{element.elementType}</p>
        <span className={`rarity-badge rarity-${element.rarity.toLowerCase()}`}>
          {element.rarity}
        </span>
      </div>
    </div>
  );
};

export default ElementCard; 