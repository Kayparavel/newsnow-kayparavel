# Polymarket 卡片开发文档

## 概述

本项目新增了 Polymarket 政治预测市场的卡片类型，用于实时显示 Polymarket 上的事件和市场预测数据。

## 新增内容

### 1. 类型定义 (`shared/types.ts`)

- 新增 `"polymarket"` 作为 `NewsType` 和 `Source` 的有效值
- 扩展 `NewsItemExtra` 接口，添加 `polymarket` 字段用于存储 Polymarket 特有数据

```typescript
export interface NewsItemExtra {
  // ... 其他字段
  /** Polymarket 源特有数据 */
  polymarket?: {
    eventSlug: string
    imageUrl?: string
    icon?: string
    endDate?: string
    active?: boolean
    description?: string
    markets: Array<{
      slug: string
      question: string
      description?: string
      outcomes?: any[]
      outcomePrices: string[]
      volume24h?: string
      active?: boolean
    }>
  }
}
```

### 2. 源解析器 (`server/sources/polymarket.ts`)

- 从 Polymarket API 获取最新事件和市场数据
- "最新" API：`https://polymarket.com/_next/data/build-TfctsWXpff2fKS/zh/new.json?category=new`
- "轮播" API：`https://polymarket.com/api/homepage/carousel?locale=zh`
- 事件数据路径（最新）：`data.pageProps.dehydratedState.queries[2].state.data.pages[0].events`
- 事件数据路径（轮播）：`data[index].event`
- 通用事件处理函数：`processEvent()`

### 3. 源配置 (`shared/pre-sources.ts`)

- 添加 Polymarket 源配置
- 包含子源 "最新"（polymarket-new）和 "轮播"（polymarket-carousel）
- 类型：polymarket
- 颜色：purple
- 刷新间隔：Fast（5分钟）

### 4. 卡片组件 (`src/components/column/card.tsx`)

新增 `NewsListPolymarket` 组件，用于渲染 Polymarket 事件卡片。

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
        description?: string   // Market 描述（用于hover）
        outcomes?: any[]       // Market 选项（目前前端不显示）
        outcomePrices: string[] // Yes/No 价格数组，如 ["0.75", "0.25"]
        volume24h?: string     // Market 24h 交易量（可选）
        active?: boolean       // Market 是否有效（true=正常，false=变灰）
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
- **hover**：鼠标悬停显示 description
- **失效状态**：`active=false` 时单个 Market 变灰

### 底部区域

- **交易量**：左侧显示 Event 总交易量
- **截止日期**：右侧显示 `endDate`，格式为 `yyyy/mm/dd 截止`

---

## 使用规范

### 源解析器开发规范

1. **Event 数据提取**
   - 必须提取：id, slug, title, description, endDate, icon, active, markets
   - 可选提取：image, volume24hr（注意 API 字段是 volume24hr）

2. **Market 数据提取**
   - 必须提取：question, slug, outcomePrices, active
   - 可选提取：description, outcomes, volume24hr

3. **交易量格式化**
   - 使用 `formatVolume()` 函数格式化交易量
   - 格式：$x.xK 或 $x.xM

4. **URL 构造**
   - Event URL：`https://polymarket.com/zh/event/${event.slug}`

### 前端组件使用规范

1. **状态判断**
   - Event 变灰：`item.extra?.polymarket?.active === false`
   - Market 变灰：`market.active === false`

2. **日期格式化**
   - 使用 `formatEndDate()` 函数格式化
   - 输出格式：`yyyy/mm/dd 截止`

3. **百分比计算**
   - Yes 百分比：`Math.round(parseFloat(market.outcomePrices[0]) * 100)`
   - No 百分比：`100 - yesPercent`

---

## 更新记录

### 2026-05-01

- ✅ 新增 Polymarket 源类型和卡片组件
- ✅ 实现横向比例条显示 Yes/No 概率
- ✅ 添加 Event 图标、endDate、active 状态
- ✅ 添加 Market outcomes、active 状态
- ✅ 实现 hover 显示 description
- ✅ 实现失效状态变灰效果
- ✅ 移除 Market 跳转链接，只保留 Event 跳转
- ✅ 新增 "轮播" 子源，API 返回干净的事件数组
- ✅ 重构源解析器，提取 `processEvent()` 通用函数处理事件
