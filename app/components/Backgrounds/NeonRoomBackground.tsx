'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface NeonRoomBackgroundProps {
  intensity?: number;
}

const NeonRoomBackground: React.FC<NeonRoomBackgroundProps> = ({ 
  intensity = 1.0 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.015);
    
    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    camera.position.z = 5;
    camera.position.y = 1;
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    
    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0.3);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    
    // Room creation
    const createRoom = () => {
      // Floor
      const floorGeometry = new THREE.PlaneGeometry(20, 20);
      const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.5,
        roughness: 0.1,
        transparent: true,
        opacity: 0.6
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2;
      floor.receiveShadow = true;
      scene.add(floor);
      
      // Ceiling
      const ceilingGeometry = new THREE.PlaneGeometry(20, 20);
      const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.5,
        roughness: 0.1,
        transparent: true,
        opacity: 0.5
      });
      const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = 5;
      ceiling.receiveShadow = true;
      scene.add(ceiling);
      
      // Walls
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.3,
        roughness: 0.2,
        transparent: true,
        opacity: 0.4
      });
      
      // Back wall
      const backWallGeometry = new THREE.PlaneGeometry(20, 7);
      const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
      backWall.position.z = -10;
      backWall.position.y = 1.5;
      backWall.receiveShadow = true;
      scene.add(backWall);
      
      // Left wall
      const leftWallGeometry = new THREE.PlaneGeometry(20, 7);
      const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
      leftWall.rotation.y = Math.PI / 2;
      leftWall.position.x = -10;
      leftWall.position.y = 1.5;
      leftWall.receiveShadow = true;
      scene.add(leftWall);
      
      // Right wall
      const rightWallGeometry = new THREE.PlaneGeometry(20, 7);
      const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
      rightWall.rotation.y = -Math.PI / 2;
      rightWall.position.x = 10;
      rightWall.position.y = 1.5;
      rightWall.receiveShadow = true;
      scene.add(rightWall);
    };
    
    // Neon lights
    const createNeonLights = () => {
      // Helper function to create neon tube
      const createNeonTube = (
        startPoint: THREE.Vector3, 
        endPoint: THREE.Vector3, 
        color: number, 
        radius: number = 0.05,
        segments: number = 16
      ) => {
        const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
        const length = direction.length();
        
        // Create the tube geometry
        const geometry = new THREE.CylinderGeometry(
          radius, radius, length, segments
        );
        
        // Rotate and position the tube to match start and end points
        geometry.translate(0, length / 2, 0);
        
        // Create emissive material
        const material = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 5 * intensity,
          metalness: 0.9,
          roughness: 0.1
        });
        
        const tube = new THREE.Mesh(geometry, material);
        
        // Orient the tube to point from start to end
        tube.position.copy(startPoint);
        
        // Create a direction vector to orient the tube
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), 
          direction.clone().normalize()
        );
        tube.setRotationFromQuaternion(quaternion);
        
        // Create a glow effect
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.4
        });
        
        const glowTube = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 2, radius * 2, length, segments),
          glowMaterial
        );
        
        glowTube.position.copy(startPoint);
        glowTube.setRotationFromQuaternion(quaternion);
        glowTube.translateY(length / 2);
        
        scene.add(tube);
        scene.add(glowTube);
        
        // Add a point light at the midpoint of the tube
        const midPoint = new THREE.Vector3().addVectors(
          startPoint, 
          direction.clone().multiplyScalar(0.5)
        );
        
        const light = new THREE.PointLight(color, 2 * intensity, 5);
        light.position.copy(midPoint);
        scene.add(light);
        
        return { tube, glowTube, light };
      };
      
      // Create neon signs on the walls
      // Sphere logo made of neon tubes
      const createSphereNeonLogo = (position: THREE.Vector3, size: number, color: number) => {
        const center = position.clone();
        
        // Create a circle with multiple segments to represent the logo
        const segments = 16;
        const points = [];
        
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const x = Math.cos(angle) * size;
          const y = Math.sin(angle) * size;
          points.push(new THREE.Vector3(position.x + x, position.y + y, position.z));
        }
        
        // Connect the points with neon tubes
        for (let i = 0; i < points.length - 1; i++) {
          createNeonTube(points[i], points[i + 1], color, 0.02);
        }
        
        // Add diagonal lines inside the circle
        for (let i = 0; i < 4; i++) {
          const angle1 = (i / 4) * Math.PI * 2;
          const angle2 = ((i + 2) / 4) * Math.PI * 2;
          
          const start = new THREE.Vector3(
            position.x + Math.cos(angle1) * size * 0.7,
            position.y + Math.sin(angle1) * size * 0.7,
            position.z
          );
          
          const end = new THREE.Vector3(
            position.x + Math.cos(angle2) * size * 0.7,
            position.y + Math.sin(angle2) * size * 0.7,
            position.z
          );
          
          createNeonTube(start, end, color, 0.015);
        }
        
        // Add a bright point light at the center
        const centerLight = new THREE.PointLight(color, 5 * intensity, 10);
        centerLight.position.copy(center);
        scene.add(centerLight);
      };
      
      // Create Sphere logo on the back wall
      createSphereNeonLogo(
        new THREE.Vector3(0, 2, -9.9), 
        1.5, 
        0x4354ff
      );
      
      // Create text "Genesis" using neon tubes
      const createNeonText = (position: THREE.Vector3, color: number) => {
        // G
        const g1 = createNeonTube(
          new THREE.Vector3(position.x - 3.5, position.y, position.z),
          new THREE.Vector3(position.x - 2.5, position.y, position.z),
          color
        );
        
        const g2 = createNeonTube(
          new THREE.Vector3(position.x - 3.5, position.y, position.z),
          new THREE.Vector3(position.x - 3.5, position.y - 1, position.z),
          color
        );
        
        const g3 = createNeonTube(
          new THREE.Vector3(position.x - 3.5, position.y - 1, position.z),
          new THREE.Vector3(position.x - 2.5, position.y - 1, position.z),
          color
        );
        
        const g4 = createNeonTube(
          new THREE.Vector3(position.x - 2.5, position.y - 1, position.z),
          new THREE.Vector3(position.x - 2.5, position.y - 0.5, position.z),
          color
        );
        
        const g5 = createNeonTube(
          new THREE.Vector3(position.x - 2.5, position.y - 0.5, position.z),
          new THREE.Vector3(position.x - 3.0, position.y - 0.5, position.z),
          color
        );
        
        // E
        const e1 = createNeonTube(
          new THREE.Vector3(position.x - 2.0, position.y, position.z),
          new THREE.Vector3(position.x - 2.0, position.y - 1, position.z),
          color
        );
        
        const e2 = createNeonTube(
          new THREE.Vector3(position.x - 2.0, position.y, position.z),
          new THREE.Vector3(position.x - 1.0, position.y, position.z),
          color
        );
        
        const e3 = createNeonTube(
          new THREE.Vector3(position.x - 2.0, position.y - 0.5, position.z),
          new THREE.Vector3(position.x - 1.0, position.y - 0.5, position.z),
          color
        );
        
        const e4 = createNeonTube(
          new THREE.Vector3(position.x - 2.0, position.y - 1, position.z),
          new THREE.Vector3(position.x - 1.0, position.y - 1, position.z),
          color
        );
        
        // N
        const n1 = createNeonTube(
          new THREE.Vector3(position.x - 0.5, position.y, position.z),
          new THREE.Vector3(position.x - 0.5, position.y - 1, position.z),
          color
        );
        
        const n2 = createNeonTube(
          new THREE.Vector3(position.x - 0.5, position.y, position.z),
          new THREE.Vector3(position.x + 0.5, position.y - 1, position.z),
          color
        );
        
        const n3 = createNeonTube(
          new THREE.Vector3(position.x + 0.5, position.y - 1, position.z),
          new THREE.Vector3(position.x + 0.5, position.y, position.z),
          color
        );
        
        // E
        const e21 = createNeonTube(
          new THREE.Vector3(position.x + 1.0, position.y, position.z),
          new THREE.Vector3(position.x + 1.0, position.y - 1, position.z),
          color
        );
        
        const e22 = createNeonTube(
          new THREE.Vector3(position.x + 1.0, position.y, position.z),
          new THREE.Vector3(position.x + 2.0, position.y, position.z),
          color
        );
        
        const e23 = createNeonTube(
          new THREE.Vector3(position.x + 1.0, position.y - 0.5, position.z),
          new THREE.Vector3(position.x + 2.0, position.y - 0.5, position.z),
          color
        );
        
        const e24 = createNeonTube(
          new THREE.Vector3(position.x + 1.0, position.y - 1, position.z),
          new THREE.Vector3(position.x + 2.0, position.y - 1, position.z),
          color
        );
        
        // S
        const s1 = createNeonTube(
          new THREE.Vector3(position.x + 2.5, position.y, position.z),
          new THREE.Vector3(position.x + 3.5, position.y, position.z),
          color
        );
        
        const s2 = createNeonTube(
          new THREE.Vector3(position.x + 2.5, position.y, position.z),
          new THREE.Vector3(position.x + 2.5, position.y - 0.5, position.z),
          color
        );
        
        const s3 = createNeonTube(
          new THREE.Vector3(position.x + 2.5, position.y - 0.5, position.z),
          new THREE.Vector3(position.x + 3.5, position.y - 0.5, position.z),
          color
        );
        
        const s4 = createNeonTube(
          new THREE.Vector3(position.x + 3.5, position.y - 0.5, position.z),
          new THREE.Vector3(position.x + 3.5, position.y - 1, position.z),
          color
        );
        
        const s5 = createNeonTube(
          new THREE.Vector3(position.x + 2.5, position.y - 1, position.z),
          new THREE.Vector3(position.x + 3.5, position.y - 1, position.z),
          color
        );
        
        // I
        const i1 = createNeonTube(
          new THREE.Vector3(position.x + 4.0, position.y, position.z),
          new THREE.Vector3(position.x + 4.0, position.y - 1, position.z),
          color
        );
        
        // S (drugi)
        const s21 = createNeonTube(
          new THREE.Vector3(position.x + 4.5, position.y, position.z),
          new THREE.Vector3(position.x + 5.5, position.y, position.z),
          color
        );
        
        const s22 = createNeonTube(
          new THREE.Vector3(position.x + 4.5, position.y, position.z),
          new THREE.Vector3(position.x + 4.5, position.y - 0.5, position.z),
          color
        );
        
        const s23 = createNeonTube(
          new THREE.Vector3(position.x + 4.5, position.y - 0.5, position.z),
          new THREE.Vector3(position.x + 5.5, position.y - 0.5, position.z),
          color
        );
        
        const s24 = createNeonTube(
          new THREE.Vector3(position.x + 5.5, position.y - 0.5, position.z),
          new THREE.Vector3(position.x + 5.5, position.y - 1, position.z),
          color
        );
        
        const s25 = createNeonTube(
          new THREE.Vector3(position.x + 4.5, position.y - 1, position.z),
          new THREE.Vector3(position.x + 5.5, position.y - 1, position.z),
          color
        );
        
        // Add a text light
        const textLight = new THREE.PointLight(color, 2 * intensity, 12);
        textLight.position.copy(position);
        // Dodatkowe światło dla lepszego oświetlenia całego napisu
        const rightLight = new THREE.PointLight(color, 2 * intensity, 12);
        rightLight.position.copy(new THREE.Vector3(position.x + 5.0, position.y, position.z));
        scene.add(rightLight);
        scene.add(textLight);
      };
      
      // Add "GENESIS" text under the logo
      createNeonText(
        new THREE.Vector3(-1, 0, -9.9), // Przesunięte bardziej w lewo dla lepszego wycentrowania
        0xFF3366
      );
      
      // Add horizontal neon tubes at the edges of the floor
      createNeonTube(
        new THREE.Vector3(-9.9, -1.95, -9.9),
        new THREE.Vector3(9.9, -1.95, -9.9),
        0x00FFFF
      );
      
      createNeonTube(
        new THREE.Vector3(-9.9, -1.95, -9.9),
        new THREE.Vector3(-9.9, -1.95, 9.9),
        0x00FFFF
      );
      
      createNeonTube(
        new THREE.Vector3(9.9, -1.95, -9.9),
        new THREE.Vector3(9.9, -1.95, 9.9),
        0x00FFFF
      );
      
      // Add vertical neon tubes in corners
      createNeonTube(
        new THREE.Vector3(-9.9, -1.95, -9.9),
        new THREE.Vector3(-9.9, 4.95, -9.9),
        0x00FFFF
      );
      
      createNeonTube(
        new THREE.Vector3(9.9, -1.95, -9.9),
        new THREE.Vector3(9.9, 4.95, -9.9),
        0x00FFFF
      );
      
      // Add ambient light for minimal overall lighting
      const ambientLight = new THREE.AmbientLight(0x111111, 0.4);
      scene.add(ambientLight);
    };
    
    // Add some floating "data" particles
    const createDataParticles = () => {
      const particleCount = 200;
      const positions = new Float32Array(particleCount * 3);
      const particleGeometry = new THREE.BufferGeometry();
      
      for (let i = 0; i < particleCount; i++) {
        // Random positions within the room
        positions[i * 3] = (Math.random() - 0.5) * 18;
        positions[i * 3 + 1] = Math.random() * 6 + 0.5; // Above floor
        positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
      }
      
      particleGeometry.setAttribute(
        'position', 
        new THREE.BufferAttribute(positions, 3)
      );
      
      const particleMaterial = new THREE.PointsMaterial({
        color: 0x4354ff,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
      
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);
      
      return particles;
    };
    
    // Create room
    createRoom();
    
    // Add neon lights
    createNeonLights();
    
    // Add particles
    const particles = createDataParticles();
    
    // Set up camera animation
    let time = 0;
    const cameraRadius = 8;
    const cameraHeight = 1.2;
    const cameraSpeed = 0.0003;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      time += 1;
      
      // Move camera in a circle around the center
      const angle = time * cameraSpeed;
      camera.position.x = Math.sin(angle) * cameraRadius;
      camera.position.z = Math.cos(angle) * cameraRadius;
      camera.position.y = cameraHeight + Math.sin(time * 0.001) * 0.2;
      
      camera.lookAt(0, 1.5, 0);
      
      // Rotate particles slowly
      if (particles) {
        particles.rotation.y += 0.0005;
      }
      
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      // Dispose of all geometries and materials
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          } else if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          }
        }
      });
      
      renderer.dispose();
    };
  }, [intensity]);
  
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none'
      }}
    />
  );
};

export default NeonRoomBackground; 