# Vercel 部署时隐藏 API 设置面板

## 目标

部署到 Vercel 后，所有 API 配置通过 proxy + 环境变量处理，前端不显示 API 设置面板。

## 改动

### 1. 检测是否部署在 Vercel

在 `demo/src/App.tsx` 中加一个常量：

```typescript
// 是否部署在 Vercel 生产环境
const isDeployed = import.meta.env.PROD === true
```

### 2. 隐藏 API 设置按钮

`App.tsx` 中 ⚙️ 按钮的条件渲染：

```typescript
{!isDeployed && (
  <button onClick={() => setSettingsOpen(!settingsOpen)}>
    ⚙️ API 设置
  </button>
)}
```

### 3. 自由模式下隐藏状态栏

自由模式顶部状态栏显示"输入问题开始对话"或"对话中 · N 条消息"。
部署后不再显示"API 设置"相关内容。

### 4. 仅本地开发可见

- 本地 `localhost` 开发时：API 设置面板正常显示，可配置 Key/Model/BaseURL
- Vercel 部署后：完全不显示 API 设置相关 UI

## 不做的事

- ❌ 不删除 ApiSettings.tsx 组件（本地开发仍需使用）
- ❌ 不修改 API 调用逻辑（proxy 已在生产环境自动接管）
