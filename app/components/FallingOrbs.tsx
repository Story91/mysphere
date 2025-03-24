'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, AdaptiveDpr, Stars, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import Image from 'next/image';

// Globalne zmienne dla zachowania stanu między re-renderami
const globalStarPositions = new Map<number, {
  position: [number, number, number];
  velocity: [number, number, number];
  brightness: number;
  size: number;
}>();

const globalOrbPositions = new Map<number, {
  position: [number, number, number];
  velocity: [number, number, number];
  energyLevel: number;
}>();

// Kolory dla kosmicznych obiektów
const COSMIC_COLORS = [
  '#0052FF', // niebieski
  '#6C1FFF', // fioletowy
  '#10B981', // zielony
  '#F97316', // pomarańczowy
  '#EF4444', // czerwony
  '#EC4899', // różowy
  '#FFFFFF', // biały
  '#8CAAEE', // jasnoniebieski
  '#D78BFF', // lawendowy
  '#00FFFF', // cyjan
];

// Symulacja ruchu bezwładnego (jak w próżni)
const GRAVITY = 0.000005;
const DRAG = 0.99995;
const NEURON_ATTRACTION = 0.000015;
const NEURON_REPULSION = 0.001;
const CONNECTION_DISTANCE = 15;

interface CosmicObjectProps {
  position: [number, number, number];
  size: number;
  color: string;
  index: number;
  objectRefs: React.MutableRefObject<THREE.Mesh[]>;
  mousePosition: React.MutableRefObject<{ x: number; y: number }>;
  scrollY: React.MutableRefObject<number>;
}

interface OrbProps {
  position: [number, number, number];
  size: number;
  color: string;
  index: number;
  orbRefs: React.MutableRefObject<THREE.Mesh[]>;
  mousePosition: React.MutableRefObject<{ x: number; y: number }>;
  scrollY: React.MutableRefObject<number>;
}

// Linie łączące neurony
const NeuronConnections = ({ orbRefs }: { orbRefs: React.MutableRefObject<THREE.Mesh[]> }) => {
  const linesMaterial = useRef<THREE.LineBasicMaterial>(null);
  const linesGeometry = useRef<THREE.BufferGeometry>(null);
  const linePositions = useRef<Float32Array>(new Float32Array(2000 * 3 * 2));
  
  useFrame(() => {
    if (!linesGeometry.current || !linesMaterial.current) return;
    
    let positionIdx = 0;
    let connectionCount = 0;
    
    // Sprawdzamy każdą parę orbów do połączenia
    for (let i = 0; i < orbRefs.current.length; i++) {
      const orb1 = orbRefs.current[i];
      if (!orb1) continue;
      
      for (let j = i + 1; j < orbRefs.current.length; j++) {
        const orb2 = orbRefs.current[j];
        if (!orb2) continue;
        
        const distance = orb1.position.distanceTo(orb2.position);
        
        // Rysujemy linię tylko jeśli orby są blisko siebie
        if (distance < CONNECTION_DISTANCE) {
          // Przezroczystość linii bazująca na odległości - im dalej, tym bardziej przezroczysta
          const opacity = 1 - (distance / CONNECTION_DISTANCE);
          
          // Zapisujemy pozycje obu końców linii
          linePositions.current[positionIdx++] = orb1.position.x;
          linePositions.current[positionIdx++] = orb1.position.y;
          linePositions.current[positionIdx++] = orb1.position.z;
          
          linePositions.current[positionIdx++] = orb2.position.x;
          linePositions.current[positionIdx++] = orb2.position.y;
          linePositions.current[positionIdx++] = orb2.position.z;
          
          connectionCount++;
          
          // Ograniczenie maksymalnej liczby połączeń
          if (connectionCount >= 1000) break;
        }
      }
      
      if (connectionCount >= 1000) break;
    }
    
    // Aktualizacja geometrii linii
    const positions = linesGeometry.current.attributes.position as THREE.BufferAttribute;
    positions.array = linePositions.current;
    positions.needsUpdate = true;
    
    // Aktualizujemy liczbę widocznych punktów
    linesGeometry.current.setDrawRange(0, positionIdx / 3);
  });
  
  return (
    <>
      {/* Główne linie - delikatniejsze z większą przezroczystością */}
      <lineSegments>
        <bufferGeometry ref={linesGeometry}>
          <bufferAttribute
            attach="attributes-position"
            count={2000 * 2}
            array={linePositions.current}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          ref={linesMaterial} 
          color="#FFFFFF" 
          transparent 
          opacity={0.15} 
          linewidth={0.5}
          fog={true}
        />
      </lineSegments>
      
      {/* Dodatkowa warstwa linii dla subtelnego świecenia */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2000 * 2}
            array={linePositions.current}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color="#88CCFF" 
          transparent 
          opacity={0.05} 
          linewidth={1.5}
          fog={true}
        />
      </lineSegments>
    </>
  );
};

// Komponent kuli reagującej na mysz i działającej jak neuron
const Orb = ({ position, size, color, index, orbRefs, mousePosition, scrollY }: OrbProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  // Pobieramy zapisane wartości pozycji i prędkości z globalnej mapy lub inicjalizujemy nowe
  let savedState = globalOrbPositions.get(index);
  
  const velocity = useRef<[number, number, number]>(
    savedState?.velocity || [
      (Math.random() - 0.5) * 0.001,
      (Math.random() - 0.5) * 0.001,
      (Math.random() - 0.5) * 0.001
    ]
  );
  
  const initialPosition = useRef<[number, number, number]>([...position]);
  const currentPosition = useRef<[number, number, number]>(
    savedState?.position || [...position]
  );
  
  const energyLevel = useRef<number>(
    savedState?.energyLevel || (Math.random() * 0.5 + 0.5)
  );
  
  // Rejestracja orba w tablicy referencji
  useEffect(() => {
    if (meshRef.current) {
      orbRefs.current[index] = meshRef.current;
      
      // Ustawiamy początkową pozycję z zapisanej wartości
      if (savedState) {
        meshRef.current.position.set(
          savedState.position[0],
          savedState.position[1],
          savedState.position[2]
        );
      }
    }
    
    return () => {
      // Usuwamy referencję przy odmontowaniu komponentu
      if (orbRefs.current[index]) {
        delete orbRefs.current[index];
      }
    };
  }, [index, orbRefs, savedState]);
  
  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return;
    
    // Wpływ scrollowania - orby poruszają się wraz ze scrollem
    const scrollOffset = scrollY.current * 0.0004;
    const targetY = initialPosition.current[1] - scrollOffset;
    
    // Minimalna grawitacja - delikatnie przyciąga orby w dół
    velocity.current[1] -= GRAVITY;
    
    // Efekt "pulsacji" neuronu - zależny od energii
    const pulseRate = 0.01 + (energyLevel.current * 0.02);
    energyLevel.current = 0.5 + Math.sin(state.clock.elapsedTime * pulseRate) * 0.2;
    
    // Wpływ myszki - przyciąganie/odpychanie kulek
    const mouseInfluence = 0.005 * energyLevel.current;
    const mouseX = (mousePosition.current.x * 2 - 1) * 20;
    const mouseY = -(mousePosition.current.y * 2 - 1) * 10;
    
    // Odległość od myszki
    const dx = mouseX - meshRef.current.position.x;
    const dy = mouseY - meshRef.current.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Przyciąganie/odpychanie zależne od odległości
    if (distance < 10) {
      // Odpychanie, gdy mysz jest blisko
      velocity.current[0] -= (dx / distance) * mouseInfluence * 3;
      velocity.current[1] -= (dy / distance) * mouseInfluence * 3;
    } else if (distance < 30) {
      // Przyciąganie, gdy mysz jest w średniej odległości
      velocity.current[0] += (dx / distance) * mouseInfluence * 0.5;
      velocity.current[1] += (dy / distance) * mouseInfluence * 0.5;
    }
    
    // Interakcja neuronowa - przyciąganie i odpychanie między neuronami
    for (let i = 0; i < orbRefs.current.length; i++) {
      if (i !== index && orbRefs.current[i]) {
        const otherOrb = orbRefs.current[i];
        const ox = otherOrb.position.x - meshRef.current.position.x;
        const oy = otherOrb.position.y - meshRef.current.position.y;
        const oz = otherOrb.position.z - meshRef.current.position.z;
        const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
        
        // Minimalna odległość, aby zapobiec dzieleniu przez zero
        const minDist = size + 0.5;
        
        if (dist < minDist) {
          // Silne odpychanie, gdy są zbyt blisko siebie (unikanie kolizji)
          const repulsionForce = NEURON_REPULSION * (1 - dist / minDist);
          velocity.current[0] -= (ox / dist) * repulsionForce;
          velocity.current[1] -= (oy / dist) * repulsionForce;
          velocity.current[2] -= (oz / dist) * repulsionForce;
        } else if (dist < CONNECTION_DISTANCE) {
          // Przyciąganie, gdy są w średniej odległości (symulacja połączeń neuronowych)
          const attractionForce = NEURON_ATTRACTION * energyLevel.current;
          velocity.current[0] += (ox / dist) * attractionForce;
          velocity.current[1] += (oy / dist) * attractionForce;
          velocity.current[2] += (oz / dist) * attractionForce;
        }
      }
    }
    
    // Siła dążąca do pozycji początkowej na osi X i Z
    const returnForce = 0.0002;
    velocity.current[0] += (initialPosition.current[0] - meshRef.current.position.x) * returnForce;
    velocity.current[2] += (initialPosition.current[2] - meshRef.current.position.z) * returnForce;
    
    // Specjalna obsługa osi Y dla scrollowania
    const yDiff = targetY - meshRef.current.position.y;
    velocity.current[1] += yDiff * 0.0005;
    
    // Prawie brak tłumienia prędkości (jak w próżni)
    velocity.current[0] *= DRAG;
    velocity.current[1] *= DRAG;
    velocity.current[2] *= DRAG;
    
    // Aktualizacja pozycji
    meshRef.current.position.x += velocity.current[0];
    meshRef.current.position.y += velocity.current[1];
    meshRef.current.position.z += velocity.current[2];
    
    // Zapisujemy aktualną pozycję i prędkość do globalnej mapy
    currentPosition.current = [
      meshRef.current.position.x,
      meshRef.current.position.y,
      meshRef.current.position.z
    ];
    
    globalOrbPositions.set(index, {
      position: currentPosition.current,
      velocity: velocity.current,
      energyLevel: energyLevel.current
    });
    
    // Synchronizacja poświaty z główną kulą
    glowRef.current.position.copy(meshRef.current.position);
    
    // Pulsowanie poświaty zależne od energii
    const pulse = 0.95 + energyLevel.current * 0.15;
    glowRef.current.scale.set(pulse, pulse, pulse);
    
    // Regulacja jasności w zależności od energii
    if (meshRef.current.material instanceof THREE.MeshBasicMaterial) {
      const opacity = 0.8 + energyLevel.current * 0.2;
      meshRef.current.material.opacity = opacity;
      
      if (glowRef.current.material instanceof THREE.MeshBasicMaterial) {
        glowRef.current.material.opacity = 0.35 + energyLevel.current * 0.25;
      }
    }
  });
  
  return (
    <>
      {/* Główna kula */}
      <mesh ref={meshRef} position={savedState?.position || position}>
        <sphereGeometry args={[size, 24, 24]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0.6}
          fog={true}
        />
      </mesh>
      
      {/* Poświata */}
      <mesh ref={glowRef} position={savedState?.position || position}>
        <sphereGeometry args={[size * 2.2, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.BackSide}
          fog={true}
        />
      </mesh>
    </>
  );
};

// Gwiazda świecąca z efektem glow
const Star = ({ position, size, color, index, objectRefs, mousePosition, scrollY }: CosmicObjectProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  // Pobieramy zapisane wartości pozycji lub inicjalizujemy nowe
  let savedState = globalStarPositions.get(index);
  
  const velocity = useRef<[number, number, number]>(
    savedState?.velocity || [
      (Math.random() - 0.5) * 0.0005,
      (Math.random() - 0.5) * 0.0005,
      (Math.random() - 0.5) * 0.0005
    ]
  );
  
  const brightness = useRef<number>(
    savedState?.brightness || (Math.random() * 0.5 + 0.5)
  );
  
  const initialPosition = useRef<[number, number, number]>([...position]);
  const currentPosition = useRef<[number, number, number]>(
    savedState?.position || [...position]
  );
  
  // Rejestracja gwiazdy w tablicy referencji
  useEffect(() => {
    if (meshRef.current) {
      objectRefs.current[index] = meshRef.current;
      
      // Ustawiamy początkową pozycję z zapisanej wartości
      if (savedState) {
        meshRef.current.position.set(
          savedState.position[0],
          savedState.position[1],
          savedState.position[2]
        );
      }
    }
    
    return () => {
      // Zapisujemy stan przed odmontowaniem
      if (meshRef.current) {
        globalStarPositions.set(index, {
          position: [
            meshRef.current.position.x,
            meshRef.current.position.y,
            meshRef.current.position.z
          ],
          velocity: velocity.current,
          brightness: brightness.current,
          size
        });
      }
      
      // Usuwamy referencję przy odmontowaniu komponentu
      if (objectRefs.current[index]) {
        delete objectRefs.current[index];
      }
    };
  }, [index, objectRefs, savedState, size]);
  
  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return;
    
    // Efekt mrugania gwiazd
    const twinkleSpeed = 0.2 + Math.random() * 0.3;
    brightness.current = 0.5 + Math.sin(state.clock.elapsedTime * twinkleSpeed + index) * 0.3;
    
    // Zastosowanie jasności do materiału
    if (meshRef.current.material instanceof THREE.MeshBasicMaterial) {
      const baseBrightness = brightness.current * 0.6 + 0.4;
      meshRef.current.material.color.setRGB(
        baseBrightness,
        baseBrightness,
        baseBrightness
      );
    }
    
    if (glowRef.current.material instanceof THREE.MeshBasicMaterial) {
      glowRef.current.material.opacity = brightness.current * 0.3;
    }
    
    // Delikatny ruch gwiazd
    meshRef.current.position.x += velocity.current[0];
    meshRef.current.position.y += velocity.current[1];
    meshRef.current.position.z += velocity.current[2];
    
    // Aktualizacja pozycji efektu glow
    glowRef.current.position.copy(meshRef.current.position);
    
    // Zawracanie na granicy obszaru
    const boundary = 50;
    if (Math.abs(meshRef.current.position.x) > boundary) velocity.current[0] *= -1;
    if (Math.abs(meshRef.current.position.y) > boundary) velocity.current[1] *= -1;
    if (Math.abs(meshRef.current.position.z) > boundary) velocity.current[2] *= -1;
    
    // Zapisujemy aktualną pozycję
    currentPosition.current = [
      meshRef.current.position.x,
      meshRef.current.position.y,
      meshRef.current.position.z
    ];
    
    // Zapisujemy stan globalnie
    globalStarPositions.set(index, {
      position: currentPosition.current,
      velocity: velocity.current,
      brightness: brightness.current,
      size
    });
  });
  
  // Rzeczywisty rozmiar gwiazdy
  const actualSize = size * 0.15;
  const glowSize = actualSize * 6;
  
  return (
    <>
      {/* Rdzeń gwiazdy */}
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[actualSize, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      
      {/* Efekt glow wokół gwiazdy */}
      <mesh ref={glowRef} position={position}>
        <sphereGeometry args={[glowSize, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>
    </>
  );
};

// Generowanie pozycji gwiazd
const generateStarPositions = (count: number, size: { width: number, height: number, depth: number }) => {
  const positions = [];
  
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * size.width;
    const y = (Math.random() - 0.5) * size.height;
    const z = (Math.random() - 0.5) * size.depth;
    
    positions.push([x, y, z]);
  }
  
  return positions;
};

// Funkcja do generowania unikalnych pozycji neuronów, które nie zmieniają się między renderami
const generateStaticOrbPositions = (count: number, size: { width: number, height: number }) => {
  const positions: Omit<OrbProps, 'orbRefs' | 'mousePosition' | 'scrollY'>[] = [];
  
  // Zwiększamy rozmiar sceny aby orby wypełniały cały ekran
  const sceneWidth = Math.min(90, size.width / 15); 
  const sceneHeight = Math.min(60, size.height / 15);
  const sceneDepth = 20; // Mniejsza głębokość, aby orby były bliżej kamery
  
  for (let i = 0; i < count; i++) {
    // Losowe pozycje w obszarze sceny
    const x = (Math.random() - 0.5) * sceneWidth;
    const y = (Math.random() - 0.5) * sceneHeight;
    const z = -5 - Math.random() * sceneDepth; // Przesuwamy bliżej kamery
    
    // Losowy rozmiar z przechyleniem w stronę mniejszych
    const size = 0.3 + Math.random() * 0.7;
    
    // Losowy kolor z preferencją dla niebieskiego
    let colorIndex;
    if (Math.random() < 0.4) {
      colorIndex = 0; // Niebieski (40% szans)
    } else {
      colorIndex = Math.floor(Math.random() * COSMIC_COLORS.length);
    }
    
    positions.push({
      position: [x, y, z],
      size,
      color: COSMIC_COLORS[colorIndex],
      index: i
    });
  }
  
  return positions;
};

// Główna scena 3D
const Scene = () => {
  const { size } = useThree();
  const starRefs = useRef<THREE.Mesh[]>([]);
  const orbRefs = useRef<THREE.Mesh[]>([]);
  const mousePosition = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const scrollY = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  // Generowanie pozycji gwiazd
  const starPositions = useMemo(() => {
    return generateStarPositions(200, { width: 200, height: 200, depth: 200 });
  }, []);
  
  // Generowanie pozycji orbów
  const [orbs, setOrbs] = useState<Omit<OrbProps, 'orbRefs' | 'mousePosition' | 'scrollY'>[]>([]);
  
  useEffect(() => {
    // Generujemy pozycje tylko raz przy montowaniu komponentu
    if (orbs.length === 0 && typeof window !== 'undefined') {
      setOrbs(generateStaticOrbPositions(60, size));
    }
  }, [orbs.length, size]);
  
  // Obsługa ruchu myszą
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePosition.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
    };
    
    // Obsługa scrollowania
    const handleScroll = () => {
      scrollY.current = window.scrollY;
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  // Animacja kamery śledzącej ruch myszy
  useFrame(() => {
    if (cameraRef.current) {
      // Delikatny ruch kamery śledzący mysz
      const targetX = (mousePosition.current.x - 0.5) * 5;
      const targetY = (mousePosition.current.y - 0.5) * 5;
      
      cameraRef.current.position.x += (targetX - cameraRef.current.position.x) * 0.02;
      cameraRef.current.position.y += (targetY - cameraRef.current.position.y) * 0.02;
      
      cameraRef.current.lookAt(0, 0, 0);
    }
  });
  
  return (
    <>
      {/* Kamera perspektywiczna z przesunięciem w głąb */}
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={[0, 0, 40]}
        fov={60}
      />
      
      {/* Tło - daleki kosmos (kleine i gęste gwiazdy) */}
      <Stars 
        radius={100} 
        depth={50} 
        count={5000} 
        factor={4} 
        saturation={0} 
        fade
        speed={0.5}
      />
      
      {/* Dodajemy połączenia między neuronami */}
      <NeuronConnections orbRefs={orbRefs} />
      
      {/* Neurony (orby) */}
      {orbs.map((orb) => (
        <Orb 
          key={orb.index} 
          position={orb.position}
          size={orb.size}
          color={orb.color}
          index={orb.index}
          orbRefs={orbRefs}
          mousePosition={mousePosition}
          scrollY={scrollY}
        />
      ))}
      
      {/* Bliskie gwiazdy - reagujące na mysz */}
      {starPositions.map((position, i) => (
        <Star
          key={i}
          index={i}
          position={position as [number, number, number]}
          size={Math.random() * 0.8 + 0.3}
          color={COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)]}
          objectRefs={starRefs}
          mousePosition={mousePosition}
          scrollY={scrollY}
        />
      ))}
      
      {/* Adaptacyjne dostosowanie jakości renderowania */}
      <AdaptiveDpr pixelated />
    </>
  );
};

// Główny komponent
const FallingOrbs = () => {
  return (
    <div className="fixed inset-0 w-full h-full z-0">
      <Canvas 
        dpr={[1, 2]} 
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'radial-gradient(circle at center, #050914 0%, #030410 70%, #01020a 100%)' }}
      >
        <fog attach="fog" args={['#000', 25, 120]} />
        <Scene />
        {/* Nakładka przyciemniająca */}
        <mesh position={[0, 0, 10]}>
          <planeGeometry args={[500, 500]} />
          <meshBasicMaterial color="#000" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </Canvas>
    </div>
  );
};

export default FallingOrbs; 