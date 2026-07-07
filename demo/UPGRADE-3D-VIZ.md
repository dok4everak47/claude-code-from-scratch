# 新增：3D Agent 编排可视化（Three.js）

## 目标
将多 Agent 编排图的 2D 树形布局替换为 3D 场景，用 Three.js 渲染 Agent 节点层次结构。
Z 轴深度表示层级，用户可以拖拽旋转/缩放/平移视角。

## 依赖
```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

## 新增组件

### demo/src/components/ThreeAgentScene.tsx
核心 3D 场景，用 `@react-three/fiber` 的 Canvas + React 组件树。

**3D 布局设计：**

```
       Z=0 (最前)
     ┌─ Coordinator ─┐        ← 大球体，Orchestrator 角色
     │                │
  Z=-2             Z=-2
┌─ Developer ─┐  ┌─ Reviewer ─┐  ← 稍小球体
              │  │
           Z=-4
         ┌─ Result ─┐          ← 最远，完成态
```

- **Z 轴 = 层级深度**: Coordinator 在 Z=0，子 Agent 在 Z=-2，结果在 Z=-4
- **X 轴 = 同层排列**: 子节点沿 X 轴分布
- **Y 轴 = 高度轻微随机偏移**，增加立体感

**节点渲染：**
- 每个 Agent 节点用 SphereGeometry（球体），颜色根据角色：
  - Orchestrator: 紫色 (#8b5cf6)
  - Worker: 蓝色 (#3b82f6)
  - Specialist: 绿色 (#10b981)
- 球体大小：Orchestrator 略大 (radius=0.8)，子节点 (radius=0.6)
- 边缘发光效果（边缘光 / Rim light）
- 球体上方悬浮 Sprite 文本（节点名称）
- 状态指示：环绕球体的发光环，颜色随状态变化：
  - pending: 灰色环，半透明
  - running: 蓝色脉动环（animated scale pulse）
  - thinking: 紫色呼吸环（animated opacity）
  - completed: 绿色静态光环
  - failed: 红色脉冲环

**连线：**
- 父子节点间用 TubeGeometry 或 CylinderGeometry 连接
- 直线或轻微曲线
- 消息传递时：光点沿连线从父飞到子（或反向）
- 连线颜色：默认灰色半透明，active 时高亮

**相机控制：**
- OrbitControls: 鼠标拖拽旋转、滚轮缩放、右键平移
- 初始视角：俯视 45°，距离 8 个单位
- 支持自动旋转（可选，用户可切换）

**动画：**
- 节点创建/状态变化时：缩放入场动画（scale 0 → 1）
- 消息传递：粒子沿贝塞尔曲线飞行
- 状态环：根据状态播放不同的循环动画（脉动/呼吸）
- 相机过渡：当选中某个节点时，平滑聚焦

**交互：**
- 点击球体 → 展开节点详情（同现有 ExpandedNodeDetail 弹窗）
- Hover 球体 → 放大 + 显示工具提示

## 修改的文件

### demo/src/components/MultiAgentFlow.tsx
在 TreeView 的位置（或作为替代视图）加入 `ThreeAgentScene`。
通过一个 toggle 或替换来实现：
- 方式：当 3D 场景启用时，`<div className="flex-1...">` 内渲染 Canvas 而不是 TreeView
- 在控制栏加一个切换按钮 `[2D | 3D]`

### demo/src/engine/types.ts
不需要修改，复用现有 AgentNode、MultiAgentSnapshot 类型。

## 关键技术细节

### 集成 @react-three/fiber
```tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text, Float } from '@react-three/drei'

function ThreeAgentScene({ rootNode, childNodes, snapshot, onNodeClick }) {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <pointLight position={[-5, 5, -5]} intensity={0.5} color="#8b5cf6" />
      
      <OrbitControls enableDamping dampingFactor={0.05} />
      
      {/* Root node */}
      <AgentNode3D
        node={rootNode}
        status={snapshot.nodeStatuses[rootNode.id]}
        position={[0, 0, 0]}
        isRoot
        onClick={() => onNodeClick(rootNode.id)}
      />
      
      {/* Child nodes */}
      {childNodes.map((child, i) => {
        const xOffset = (i - (childNodes.length - 1) / 2) * 2.5
        return (
          <AgentNode3D
            key={child.id}
            node={child}
            status={snapshot.nodeStatuses[child.id]}
            position={[xOffset, -0.5, -2]}
            onClick={() => onNodeClick(child.id)}
          />
        )
      })}
      
      {/* Connection lines */}
      {childNodes.map((child, i) => {
        const xOffset = (i - (childNodes.length - 1) / 2) * 2.5
        return (
          <ConnectionLine
            key={`conn-${child.id}`}
            from={[0, 0, 0]}
            to={[xOffset, -0.5, -2]}
            isActive={/* check if there's an active message */}
          />
        )
      })}
    </Canvas>
  )
}
```

### 球体 AgentNode3D 组件
```tsx
function AgentNode3D({ node, status, position, isRoot, onClick }) {
  const colorMap = { orchestrator: '#8b5cf6', worker: '#3b82f6', specialist: '#10b981' }
  const color = colorMap[node.role]
  const radius = isRoot ? 0.8 : 0.6

  return (
    <group position={position} onClick={onClick}>
      {/* Main sphere */}
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>
      
      {/* Status ring */}
      <StatusRing status={status} radius={radius + 0.15} />
      
      {/* Text label (Sprite) */}
      <Text
        position={[0, radius + 0.5, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {node.name}
      </Text>
    </group>
  )
}
```

### 粒子消息动画
```tsx
function MessageParticle({ from, to, onComplete }) {
  const [progress, setProgress] = useState(0)
  
  useFrame((_, delta) => {
    setProgress(p => Math.min(p + delta * 0.5, 1))
  })
  
  // Catmull-Rom or quadratic bezier interpolation between from and to
  const pos = new THREE.Vector3().lerpVectors(from, to, progress)
  // Add a slight arc in Y for visual appeal
  pos.y += Math.sin(progress * Math.PI) * 1.5
  
  if (progress >= 1) {
    onComplete?.()
    return null
  }
  
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial color="#60a5fa" />
      {/* Glow trail */}
      <pointLight color="#60a5fa" intensity={2} distance={1} />
    </mesh>
  )
}
```

## 不修改的文件
- `src/` (CLI core)
- `App.tsx` — 不需要改，MultiAgentFlow 内部替换
- `types.ts` — 不需要改
- `multiAgentEngine.ts` — 不需要改
- `multiAgentScenarios.ts` — 不需要改

## 测试
1. `cd demo && npm install`（装 three + drei + fiber）
2. `npm run dev`
3. 切换到 🤖 多 Agent，选择场景
4. 看到 3D 球体场景，可拖拽旋转
5. 点击节点弹出详情
6. 点「自动播放」看动画
7. 检查性能（FPS）
8. `npm run build` 确认编译通过

## 性能注意事项
- Canvas 只在多 Agent 模式激活时渲染（条件挂载，用 `display: none` 或条件渲染）
- OrbitControls 开启 damping 减少闪烁
- 球体分段数（segments）不要太高，32 足够
- 使用 `useMemo` 缓存几何体和材质
- 粒子数量控制：一次只飞一个粒子
