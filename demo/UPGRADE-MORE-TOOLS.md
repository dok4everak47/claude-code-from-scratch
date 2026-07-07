# 新增：更多真实工具 — Wikipedia / 汇率 / 词典 / 笑话

## 目标
在自由模式（Live Mode）中增加 4 个新的真实工具，让 Agent 能回答更广泛的问题，
并且所有工具都不需要 API Key，纯前端可用。

## 新增工具列表

### 1. wikipedia_search — 查百科
- **API:** `https://en.wikipedia.org/api/rest_v1/page/summary/{encodeURIComponent(title)}`
- **不需要 API Key，CORS 已开放**
- **用途:** Agent 可以根据用户问题搜索 Wikipedia 获取概念/人物/事件解释
- **提示用户:** 引导 Agent 在涉及知识性问题时调用此工具
- **示例调用:**
  ```
  wikipedia_search(query: "Transformer (machine learning)")
  ```
- **返回示例:**
  ```json
  {
    "title": "Transformer (machine learning)",
    "extract": "A transformer is a deep learning architecture...",
    "url": "https://en.wikipedia.org/wiki/Transformer_(machine_learning)"
  }
  ```

### 2. get_exchange_rate — 汇率查询
- **API:** `https://api.exchangerate-api.com/v4/latest/{baseCurrency}`
- **不需要 API Key，CORS 已开放**
- **用途:** Agent 查询汇率，回答"100美元是多少人民币"等问题
- **限制:** exchangerate-api.com 免费版每天 1500 次请求，对 demo 足够
- **示例调用:**
  ```
  get_exchange_rate(base: "USD", target: "CNY")
  ```
- **返回示例:**
  ```json
  {
    "base": "USD",
    "target": "CNY",
    "rate": 7.24,
    "date": "2026-07-07"
  }
  ```

### 3. get_definition — 查词典
- **API:** `https://api.dictionaryapi.dev/api/v2/entries/en/{encodeURIComponent(word)}`
- **不需要 API Key，CORS 已开放**
- **用途:** Agent 查询英文单词的定义、发音、例句
- **示例调用:**
  ```
  get_definition(word: "ephemeral")
  ```
- **返回示例:**
  ```json
  {
    "word": "ephemeral",
    "phonetic": "/ɪˈfɛm(ə)rəl/",
    "meanings": [
      { "partOfSpeech": "adjective", "definition": "lasting for a very short time" }
    ],
    "example": "The ephemeral nature of fashion trends"
  }
  ```

### 4. get_joke — 讲个笑话
- **API:** `https://v2.jokeapi.dev/joke/Any?type=single&safe-mode`
- **不需要 API Key，CORS 已开放**
- **用途:** Agent 在轻松场景下讲个笑话，展示非严肃工具调用
- **示例调用:**
  ```
  get_joke(category: "programming")
  ```
- **返回示例:**
  ```json
  {
    "joke": "Why do programmers prefer dark mode? Because light attracts bugs.",
    "category": "Programming"
  }
  ```
- **注意:** 使用 `safe-mode` 参数过滤不适合内容

## 需要修改的文件

### demo/src/engine/liveTools.ts
在 `liveTools` 数组末尾添加 4 个新的 `LiveToolDef`。参考现有 `get_weather` 的实现模式：

1. 每个 tool 实现一个 `execute` 函数，用 `fetch` 调对应 API
2. 错误处理：API 失败时返回友好的错误消息（不要 throw，返回 `JSON.stringify({error: "..."})`）
3. 超时：每个 fetch 加 10 秒 timeout

### demo/src/engine/types.ts
不需要修改。现有 `LiveToolDef` 类型已支持。

### demo/src/engine/scenarios.ts
如果想展示新工具的预设场景，可以新增一个场景，例如：
- "知识问答"场景：Agent 调用 wikipedia_search 查询概念 + get_definition 查词

但这不是必须的——预设场景主要是展示模拟器流程，新工具主要服务于自由模式。

### demo/src/components/ChatPanel.tsx
如果当前 System Prompt 中硬编码的工具列表不全，需要更新 system prompt 描述，让 LLM 知道新工具有哪些。

## 不修改的文件
- `src/` (CLI core) — 绝不碰
- `AgentFlow.tsx`, `ToolCard.tsx` — 不需要改，tool call 展示逻辑是通用的
- `App.tsx` — 不需要改

## 测试方法
1. `cd demo && npm run dev`
2. 切换到「自由模式」
3. 输入「查一下 Python 编程语言是什么」→ 应调用 wikipedia_search
4. 输入「100 欧元等于多少人民币」→ 应调用 get_exchange_rate
5. 输入「definition of serendipity」→ 应调用 get_definition
6. 输入「讲个笑话」→ 应调用 get_joke

## System Prompt 更新建议
在 `defaultApiConfig().systemPrompt` 中，工具列表部分需要更新为：

```
你有以下工具可用：
- get_weather（查询天气，支持城市名）
- calculate（数学计算）
- get_time（获取时间）
- wikipedia_search（搜索 Wikipedia 百科，查询概念/人物/事件）
- get_exchange_rate（查询汇率，需要 base 和 target 货币代码）
- get_definition（查英文单词的定义和发音）
- get_joke（讲个笑话，可选 category 参数）
```

并且建议在 system prompt 最后加一句：
```
注意：涉及知识性问题优先使用 wikipedia_search 而不是依赖训练数据。
```
