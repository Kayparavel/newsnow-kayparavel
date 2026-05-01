# Polymarket 卡片使用文档

## 概述

本项目新增了 Polymarket 政治预测市场的卡片类型，用于实时显示 Polymarket 上的事件和市场预测数据。

---

## 数据结构要求

### NewsItem 主体

```typescript
{
  id: string | number           // Event 唯一ID
  title: string                // Event 标题（大字体显示）
  url: string                  // Event 跳转链接（点击标题/图标跳转）
  extra: {
    hover?: string             // Event hover 提示内容
    polymarket: {
      eventSlug: string        // Event slug（用于构造URL）
      imageUrl?: string        // Event 大图地址
      icon?: string            // Event 图标（在标题左边显示）
      endDate?: string         // Event 截止日期（ISO格式）
      active?: boolean         // Event 是否有效（true=正常，false=变灰）
      description?: string     // Event 描述（用于hover）
      markets: Array<{         // Market 列表
        slug: string           // Market slug
        question: string       // Market 问题
        description?: string   // Market 描述（用于hover，可选）
        outcomes?: any[]       // Market 选项（目前前端不显示，可选）
        outcomePrices: string[] // Yes/No 价格数组，如 ["0.75", "0.25"]
        volume24h?: string     // Market 24h 交易量（可选）
        active?: boolean       // Market 是否有效（true=正常，false=变灰）
        url?: string           // Market 跳转链接（点击market行跳转）
      }>
    }
  }
}
```

---

## 卡片显示效果

### Event 区域

- **图标**：在标题左边显示（可选）
- **标题**：大字体显示，点击跳转到 Polymarket 事件页面
- **失效状态**：`active=false` 时整个 Event 变灰

### Market 区域

- **问题**：小字体显示 Market 问题
- **比例条**：横向比例条，左边绿色代表 Yes，右边红色代表 No
- **百分比**：Yes/No 百分比在比例条右侧显示
- **hover**：鼠标悬停显示 question
- **失效状态**：`active=false` 时单个 Market 变灰
- **跳转**：点击 Market 行跳转到对应的 market.url

### 底部区域

- **交易量**：左侧显示 Event 总交易量（从第一个 market 取）
- **截止日期**：右侧显示 `endDate`，格式为 `yyyy/mm/dd 截止`

---

## 使用规范

### 源解析器开发规范

#### 1. Event 数据提取

- **必须提取**：id, slug, title, active
- **可选提取**：icon, endDate, description, image

#### 2. Market 数据提取

- **必须提取**：question, slug, outcomePrices
- **可选提取**：description, outcomes, volume24hr, active, url

#### 3. URL 构造规范

```typescript
// Event URL
eventUrl: `https://polymarket.com/zh/event/${eventSlug}`

// Market URL
marketUrl: `https://polymarket.com/zh/event/${eventSlug}/${marketSlug}`
```

#### 4. 交易量格式化

使用 `formatVolume()` 函数（在 `polymarket.ts` 里）：
- 格式：$x.xK 或 $x.xM
- 处理 null/undefined 情况

#### 5. 三种源类型说明

| 源类型 | API 说明 | 返回结构 |
|--------|---------|---------|
| **最新** | Next.js Data API | `events[]` 数组，每个 event 有自己的 `markets[]` |
| **轮播** | Carousel API | 干净的 `event[]` 数组，每个 event 有完整 `markets[]` |
| **突发** | Breaking API | `markets[]` 数组，每个 market 单独作为 NewsItem，event 信息从 market.events[0] 获取 |

### 前端组件使用规范

#### 1. 状态判断

```typescript
// Event 变灰
const isEventActive = item.extra?.polymarket?.active ?? true

// Market 变灰
const isMarketActive = market.active ?? true
```

#### 2. 日期格式化

使用 `formatEndDate()` 函数（在 `card.tsx` 里）：
- 输入：ISO 日期字符串
- 输出：`yyyy/mm/dd 截止`

#### 3. 百分比计算

```typescript
const yesPrice = Number(market.outcomePrices?.[0] || 0)
const noPrice = Number(market.outcomePrices?.[1] || 0)
const yesPercent = yesPrice * 100
const noPercent = noPrice * 100
```

---

## 源文件位置

- **源解析器**：`server/sources/polymarket.ts`
- **类型定义**：`shared/types.ts`
- **卡片组件**：`src/components/column/card.tsx`
- **源配置**：`shared/pre-sources.ts`
