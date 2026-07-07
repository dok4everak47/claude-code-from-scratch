// ============================================================
// ThreeAgentScene — 3D Multi-Agent Visualization
// Uses @react-three/fiber Canvas with sphere nodes, status rings,
// connection lines, and message particles.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'
import type {
  AgentNode,
  AgentMessage,
  MultiAgentSnapshot,
  MultiAgentStatus,
} from '@/engine/types'

// ============================================================
// Constants
// ============================================================

const ROLE_COLORS: Record<string, string> = {
  orchestrator: '#8b5cf6',
  worker: '#3b82f6',
  specialist: '#10b981',
}

const STATUS_LABEL: Record<MultiAgentStatus, string> = {
  pending: '待命',
  running: '运行中',
  thinking: '思考中',
  using_tools: '使用工具',
  waiting: '等待',
  completed: '完成',
  failed: '失败',
}

const STATUS_RING_CONFIG: Record<
  MultiAgentStatus,
  { color: string; anim: 'none' | 'pulse' | 'breathe' | 'glow' | 'fail' }
> = {
  pending:     { color: '#64748b', anim: 'none' },
  running:     { color: '#3b82f6', anim: 'pulse' },
  thinking:    { color: '#8b5cf6', anim: 'breathe' },
  using_tools: { color: '#eab308', anim: 'pulse' },
  waiting:     { color: '#64748b', anim: 'none' },
  completed:   { color: '#10b981', anim: 'glow' },
  failed:      { color: '#ef4444', anim: 'fail' },
}

// ============================================================
// Props
// ============================================================

interface ThreeAgentSceneProps {
  rootNode: AgentNode | null
  childNodes: AgentNode[]
  snapshot: MultiAgentSnapshot | null
  onNodeClick: (id: string) => void
  activeConnections: Map<string, { message: AgentMessage; isNew: boolean }>
}

// ============================================================
// SceneContent — all 3D objects go here (inside Canvas)
// ============================================================

function SceneContent({
  rootNode,
  childNodes,
  snapshot,
  onNodeClick,
  activeConnections,
}: ThreeAgentSceneProps) {
  const rootPos = useMemo(() => new THREE.Vector3(0, 0.3, 0), [])

  const childPositions = useMemo(() => {
    const spacing = 2.5
    return childNodes.map((_, i) => {
      const xOffset = (i - (childNodes.length - 1) / 2) * spacing
      return new THREE.Vector3(xOffset, 0, -2.5)
    })
  }, [childNodes])

  // Particle tracking
  const [particles, setParticles] = useState<
    Array<{ id: string; fromPos: THREE.Vector3; toPos: THREE.Vector3 }>
  >([])
  const prevNewKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const newKeys = new Set<string>()
    const spawned: Array<{ id: string; fromPos: THREE.Vector3; toPos: THREE.Vector3 }> = []

    activeConnections.forEach((conn, key) => {
      if (conn.isNew) {
        newKeys.add(key)
        if (!prevNewKeysRef.current.has(key)) {
          const [fromId, toId] = key.split('→')
          const findPos = (id: string): THREE.Vector3 => {
            if (id === rootNode?.id) return rootPos
            const idx = childNodes.findIndex((n) => n.id === id)
            return idx >= 0 ? childPositions[idx] : rootPos
          }
          spawned.push({
            id: `p-${key}-${Date.now()}`,
            fromPos: findPos(fromId).clone(),
            toPos: findPos(toId).clone(),
          })
        }
      }
    })
    prevNewKeysRef.current = newKeys

    if (spawned.length > 0) {
      setParticles((prev) => [...prev, ...spawned])
    }
  }, [activeConnections, rootNode, rootPos, childNodes, childPositions])

  const removeParticle = useCallback((id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const getNodeStatus = useCallback(
    (nodeId: string): MultiAgentStatus => snapshot?.nodeStatuses[nodeId] ?? 'pending',
    [snapshot],
  )

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <pointLight position={[-5, 5, -5]} intensity={0.4} color="#8b5cf6" />
      <pointLight position={[5, -5, 5]} intensity={0.3} color="#3b82f6" />

      {/* Fog */}
      <fog attach="fog" args={['#0f172a', 10, 20]} />

      {/* Controls */}
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={3} maxDistance={20} target={new THREE.Vector3(0, 0, -1)} />

      {/* Root */}
      {rootNode && (
        <AgentNode3D
          node={rootNode}
          status={getNodeStatus(rootNode.id)}
          position={rootPos}
          radius={0.8}
          onClick={() => onNodeClick(rootNode.id)}
        />
      )}

      {/* Children */}
      {childNodes.map((child, i) => (
        <AgentNode3D
          key={child.id}
          node={child}
          status={getNodeStatus(child.id)}
          position={childPositions[i]}
          radius={0.6}
          onClick={() => onNodeClick(child.id)}
        />
      ))}

      {/* Connections */}
      {rootNode &&
        childNodes.map((child, i) => {
          const connKey = `${rootNode.id}→${child.id}`
          const conn = activeConnections.get(connKey)
          return (
            <ConnectionLine
              key={`conn-${child.id}`}
              start={rootPos}
              end={childPositions[i]}
              isActive={conn !== undefined}
              isNew={conn?.isNew ?? false}
            />
          )
        })}

      {/* Particles */}
      {particles.map((p) => (
        <MessageParticle key={p.id} from={p.fromPos} to={p.toPos} onRemove={() => removeParticle(p.id)} />
      ))}
    </>
  )
}

// ============================================================
// AgentNode3D — sphere + ring + label
// ============================================================

function AgentNode3D({
  node,
  status,
  position,
  radius,
  onClick,
}: {
  node: AgentNode
  status: MultiAgentStatus
  position: THREE.Vector3
  radius: number
  onClick: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  // Entry animation
  const entryScaleRef = useRef(0)
  useFrame((_, delta) => {
    if (entryScaleRef.current < 1) {
      entryScaleRef.current = Math.min(entryScaleRef.current + delta * 2, 1)
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(entryScaleRef.current)
    }
  })

  const color = ROLE_COLORS[node.role] ?? '#64748b'

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onClick()
    },
    [onClick],
  )

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={handleClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Glow halo */}
      {(hovered || status === 'completed') && (
        <mesh>
          <sphereGeometry args={[radius * 1.3, 16, 16]} />
          <meshBasicMaterial
            color={hovered ? '#60a5fa' : '#10b981'}
            transparent
            opacity={hovered ? 0.12 : 0.08}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Main sphere */}
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          metalness={0.3}
          roughness={0.4}
          emissive={color}
          emissiveIntensity={hovered ? 0.15 : 0.05}
        />
      </mesh>

      {/* Status ring */}
      <StatusRing status={status} radius={radius * 1.35} />

      {/* Name label above */}
      <Text position={[0, radius + 0.55, 0]} fontSize={0.3} color="#e2e8f0" anchorX="center" anchorY="middle" fontWeight="bold">
        {node.name}
      </Text>

      {/* Status label below */}
      <Text position={[0, -radius - 0.4, 0]} fontSize={0.18} color="#94a3b8" anchorX="center" anchorY="middle">
        {STATUS_LABEL[status]}
      </Text>
    </group>
  )
}

// ============================================================
// StatusRing — animated ring around sphere
// ============================================================

function StatusRing({ status, radius }: { status: MultiAgentStatus; radius: number }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const cfg = STATUS_RING_CONFIG[status]

  useFrame((_, delta) => {
    timeRef.current += delta
    if (!ringRef.current) return
    const t = timeRef.current
    const mat = ringRef.current.material as THREE.MeshBasicMaterial

    switch (cfg.anim) {
      case 'none':
        ringRef.current.scale.setScalar(1)
        mat.opacity = 0.25
        break
      case 'pulse': {
        const s = 1 + Math.sin(t * 3) * 0.12
        ringRef.current.scale.setScalar(s)
        mat.opacity = 0.5 + Math.sin(t * 3) * 0.2
        break
      }
      case 'breathe':
        ringRef.current.scale.setScalar(1)
        mat.opacity = 0.3 + Math.sin(t * 2) * 0.35
        break
      case 'glow':
        ringRef.current.scale.setScalar(1.05)
        mat.opacity = 0.55 + Math.sin(t * 1.5) * 0.1
        break
      case 'fail': {
        const s = 1 + Math.sin(t * 5) * 0.08
        ringRef.current.scale.setScalar(s)
        mat.opacity = 0.4 + Math.sin(t * 5) * 0.3
        break
      }
    }
  })

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0.3, 0]}>
      <torusGeometry args={[radius, 0.035, 16, 48]} />
      <meshBasicMaterial color={cfg.color} transparent opacity={0.3} depthWrite={false} />
    </mesh>
  )
}

// ============================================================
// ConnectionLine — curved tube or line between nodes
// ============================================================

function ConnectionLine({
  start,
  end,
  isActive,
  isNew,
}: {
  start: THREE.Vector3
  end: THREE.Vector3
  isActive: boolean
  isNew: boolean
}) {
  const [curve, points] = useMemo(() => {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    mid.y = -0.7 + Math.abs(end.x - start.x) * 0.3
    const c = new THREE.QuadraticBezierCurve3(start, mid, end)
    return [c, c.getPoints(24)]
  }, [start, end])

  const color = isNew ? '#60a5fa' : isActive ? '#10b981' : '#334155'
  const opacity = isActive ? 0.8 : 0.3

  // Active connections use tube geometry for glow
  if (isActive) {
    const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 16, 0.025, 8, false), [curve])
    return (
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color={color} transparent opacity={isNew ? 0.7 : 0.4} depthWrite={false} />
      </mesh>
    )
  }

  // Inactive lines — use Line from drei
  return (
    <Line
      points={points}
      color={color}
      lineWidth={1}
      transparent
      opacity={opacity}
    />
  )
}

// ============================================================
// MessageParticle — animated fly-along effect
// ============================================================

function MessageParticle({
  from,
  to,
  onRemove,
}: {
  from: THREE.Vector3
  to: THREE.Vector3
  onRemove: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const progressRef = useRef(0)
  const [done, setDone] = useState(false)

  const curve = useMemo(() => {
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
    mid.y += 1.2
    return new THREE.QuadraticBezierCurve3(from, mid, to)
  }, [from, to])

  useFrame((_, delta) => {
    if (done) return
    progressRef.current += delta * 0.6
    if (progressRef.current >= 1) {
      setDone(true)
      onRemove()
      return
    }
    const pos = curve.getPoint(progressRef.current)
    if (meshRef.current) {
      meshRef.current.position.copy(pos)
    }
  })

  if (done) return null

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
      <pointLight color="#60a5fa" intensity={3} distance={1.5} />
    </group>
  )
}

// ============================================================
// Main exported component
// ============================================================

export default function ThreeAgentScene(props: ThreeAgentSceneProps) {
  return (
    <div className="w-full h-full min-h-[300px]">
      <Canvas
        camera={{ position: [0, 5, 8], fov: 45, near: 0.1, far: 30 }}
        gl={{ antialias: true }}
        style={{ background: 'transparent' }}
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  )
}
