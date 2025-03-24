import { useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Group } from 'three'

export function RobotModel() {
  const modelRef = useRef<Group>(null)
  const { scene } = useGLTF('/Futuristic_Robot_Assi_0318030719_texture.glb')

  // Add subtle floating animation and mouse follow
  useFrame((state) => {
    if (modelRef.current) {
      // Floating animation
      modelRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1

      // Mouse follow
      const mouseX = (state.mouse.x * Math.PI) / 4
      const mouseY = (state.mouse.y * Math.PI) / 4

      modelRef.current.rotation.y = THREE.MathUtils.lerp(
        modelRef.current.rotation.y,
        mouseX,
        0.05
      )
      modelRef.current.rotation.x = THREE.MathUtils.lerp(
        modelRef.current.rotation.x,
        -mouseY * 0.5,
        0.05
      )
    }
  })

  return (
    <>
      {/* Add rim light */}
      <pointLight position={[-5, 5, -5]} intensity={2} color="#5788FA" />
      <pointLight position={[5, 5, 5]} intensity={1.5} color="#ffffff" />
      <primitive 
        ref={modelRef}
        object={scene} 
        scale={2.2}
        position={[1, 0, 0]}
      />
    </>
  )
}

useGLTF.preload('/Futuristic_Robot_Assi_0318030719_texture.glb') 