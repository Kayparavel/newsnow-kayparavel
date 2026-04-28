# NewsNow 项目结构与功能分析

## 项目概述

这是一个名为 **NewsNow** 的现代化新闻聚合与阅读平台，旨在提供优雅的实时热门新闻阅读体验。项目采用了前沿的技术栈，支持多种新闻源的自动抓取、展示和个性化功能。

## 项目架构概览

```
newsnow/
├── src/                 # 前端应用代码
├── server/              # 后端服务器与新闻抓取代码
├── shared/              # 前后端共享代码与配置
├── public/              # 静态资源（图标、字体、PWA文件等）
├── scripts/             # 工具脚本
├── patches/             # 依赖包补丁
└── 配置文件
```

## 核心功能模块

### 1. 前端应用 (src/)
- **架构**：React 19 + TypeScript + Vite
- **状态管理**：Jotai（原子化状态管理）
- **路由**：TanStack React Router
- **UI 框架**：UnoCSS（原子化 CSS）
- **数据请求**：TanStack React Query

**主要组件**：
- **Atoms**：全局状态管理，包括源管理、聚焦源、当前列等
- **Components**：可复用 UI 组件（卡片、拖拽排序、搜索栏、导航栏等）
- **Hooks**：自定义钩子（登录、主题切换、搜索、同步等）
- **Routes**：页面路由（首页、分类页等）

### 2. 后端服务 (server/)
- **架构**：Nitro（基于 H3 的服务端框架）
- **数据库**：DB0（支持多种数据库，主推 Cloudflare D1）
- **新闻源解析**：Cheerio（HTML 解析）、Fast XML Parser（RSS 解析）

**主要功能**：
- **API 接口**：提供新闻数据获取、用户登录、同步等接口
- **新闻源解析**：每个新闻源都有对应的解析器（如 36kr、知乎、微博等）
- **缓存系统**：智能缓存管理，根据源更新频率动态调整抓取间隔
- **MCP 服务器**：支持 Model Context Protocol，允许集成到其他应用

### 3. 共享模块 (shared/)
- **源配置**：统一管理所有新闻源的元数据（id、名称、图标、分类等）
- **类型定义**：前后端共享的 TypeScript 类型
- **工具函数**：通用工具（URL 处理、验证、常量等）
- **数据源列表**：预定义的新闻源配置（sources.json）

## 新闻抓取系统详细技术实现

### 1. 新闻源定义与配置

#### 1.1 源类型定义 (shared/types.ts)
```typescript
export interface Source {
  name: string
  interval: number          // 刷新间隔时间（毫秒）
  color: Color
  title?: string            // 小标题
  desc?: string             // 描述
  type?: "hottest" | "realtime"  // 内容类型
  column?: string           // 默认分类
  home?: string             // 主页链接
  disable?: boolean | "cf"  // 是否禁用
  redirect?: SourceID       // 重定向到其他源
  staggerRefresh?: boolean  // 刷新时是否需要错开（避免并发请求被限制）
}

export interface NewsItem {
  id: string | number       // 唯一标识
  title: string             // 标题
  url: string               // 链接
  mobileUrl?: string        // 移动端链接
  pubDate?: number | string // 发布时间
  extra?: {
    hover?: string          // 悬停显示的描述
    date?: number | string  // 日期
    info?: false | string   // 附加信息（如作者、热度）
    diff?: number           // 热度变化
    icon?: false | string | { url: string; scale: number }  // 图标
  }
}
```

**staggerRefresh 使用说明：**
- 某些新闻源会限制同一 IP 并发请求数，当多个板块同时刷新时会导致部分请求失败
- 为这些源设置 `staggerRefresh: true`，在全体刷新时会按顺序处理，每个源间隔 1 秒
- 配置定义在 `shared/pre-sources.ts` 中
- 实际使用在 `src/hooks/useRefetch.ts` 中
- 配置示例见 `shared/pre-sources.ts` 中的界面新闻源

#### 1.2 源配置文件

源配置分为两个文件：

1. **`shared/pre-sources.ts`**：源配置的源文件，手动编辑此文件
2. **`shared/sources.json`**：自动生成的文件，通过 `pnpm presource` 命令从 `pre-sources.ts` 生成

**生成命令：**
```bash
pnpm run presource
```

该命令在 `package.json` 中定义：
```json
"presource": "tsx ./scripts/favicon.ts && tsx ./scripts/source.ts"
```

**注意：**
- 不要手动修改 `sources.json`
- 修改 `pre-sources.ts` 后需要重新运行 `pnpm presource` 来更新 `sources.json`

**示例配置：**
```json
{
  "zhihu": {
    "name": "知乎",
    "type": "hottest",
    "column": "china",
    "home": "https://www.zhihu.com",
    "color": "blue",
    "interval": 600000  // 10分钟刷新一次
  },
  "weibo": {
    "title": "实时热搜",
    "name": "微博",
    "type": "hottest",
    "column": "china",
    "home": "https://weibo.com",
    "color": "red",
    "interval": 120000  // 2分钟刷新一次（最快）
  },
  "v2ex": {
    "name": "V2EX",
    "column": "tech",
    "home": "https://v2ex.com/",
    "color": "slate",
    "interval": 600000,  // 10分钟刷新一次
    "title": "最新分享"
  }
}
```

### 2. 后端抓取核心架构

#### 2.1 抓取函数定义 (server/utils/source.ts)

项目提供了多种源定义方式：

```typescript
// 1. 直接定义源
export function defineSource(source: SourceGetter | Record<string, SourceGetter>): any {
  return source
}

// 2. RSS 源定义
export function defineRSSSource(url: string, option?: SourceOption): SourceGetter {
  return async () => {
    const data = await rss2json(url)
    if (!data?.items.length) throw new Error("Cannot fetch rss data")
    return data.items.map(item => ({
      title: item.title,
      url: item.link,
      id: item.link,
      pubDate: !option?.hiddenDate ? item.created : undefined,
    }))
  }
}

// 3. RSSHub 源定义
export function defineRSSHubSource(route: string, RSSHubOptions?: RSSHubOption, sourceOption?: SourceOption): SourceGetter {
  return async () => {
    const RSSHubBase = "https://rsshub.rssforever.com"
    const url = new URL(route, RSSHubBase)
    url.searchParams.set("format", "json")
    
    const data: RSSHubResponse = await myFetch(url)
    return data.items.map(item => ({
      title: item.title,
      url: item.url,
      id: item.id ?? item.url,
      pubDate: !sourceOption?.hiddenDate ? item.date_published : undefined,
    }))
  }
}

// 4. 代理源定义
export function proxySource(proxyUrl: string, source: SourceGetter) {
  return process.env.CF_PAGES
    ? defineSource(async () => {
        const data = await myFetch(proxyUrl)
        return data.items
      })
    : source
}
```

#### 2.2 统一请求工具 (server/utils/fetch.ts)

```typescript
import { $fetch } from "ofetch"

export const myFetch = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
})
```

### 3. 新闻源解析器实现

#### 3.1 典型 HTML 解析源 - 36氪 (server/sources/_36kr.ts)

```typescript
import type { NewsItem } from "@shared/types"
import { load } from "cheerio"
import dayjs from "dayjs/esm"

const quick = defineSource(async () => {
  const baseURL = "https://www.36kr.com"
  const url = `${baseURL}/newsflashes`
  const response = await myFetch(url) as any
  const $ = load(response)
  const news: NewsItem[] = []
  
  const $items = $(".newsflash-item")
  $items.each((_, el) => {
    const $el = $(el)
    const $a = $el.find("a.item-title")
    const url = $a.attr("href")
    const title = $a.text()
    const relativeDate = $el.find(".time").text()
    
    if (url && title && relativeDate) {
      news.push({
        url: `${baseURL}${url}`,
        title,
        id: url,
        extra: {
          date: parseRelativeDate(relativeDate, "Asia/Shanghai").valueOf(),
        },
      })
    }
  })
  
  return news
})

const renqi = defineSource(async () => {
  const baseURL = "https://36kr.com"
  const formatted = dayjs().format("YYYY-MM-DD")
  const url = `${baseURL}/hot-list/renqi/${formatted}/1`
  
  const response = await myFetch<any>(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Referer": "https://www.freebuf.com/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    },
  })
  
  const $ = load(response)
  const articles: NewsItem[] = []
  
  const $items = $(".article-item-info")
  $items.each((_, el) => {
    const $el = $(el)
    const $a = $el.find("a.article-item-title.weight-bold")
    const href = $a.attr("href") || ""
    const title = $a.text().trim()
    const description = $el.find("a.article-item-description.ellipsis-2").text().trim()
    const author = $el.find(".kr-flow-bar-author").text().trim()
    const hot = $el.find(".kr-flow-bar-hot span").text().trim()
    
    if (href && title) {
      articles.push({
        url: href.startsWith("http") ? href : `${baseURL}${href}`,
        title,
        id: href.slice(3),
        extra: {
          info: `${author}  |  ${hot}`,
          hover: description,
        },
      })
    }
  })
  
  return articles
})

export default defineSource({
  "36kr": quick,
  "36kr-quick": quick,
  "36kr-renqi": renqi,
})
```

#### 3.2 典型 API 接口源 - 知乎 (server/sources/zhihu.ts)

```typescript
interface Res {
  data: {
    type: "hot_list_feed"
    style_type: "1"
    feed_specific: { answer_count: number }
    target: {
      title_area: { text: string }
      excerpt_area: { text: string }
      image_area: { url: string }
      metrics_area: { text: string; font_color: string; background: string; weight: string }
      label_area: { type: "trend"; trend: number; night_color: string; normal_color: string }
      link: { url: string }
    }
  }[]
}

export default defineSource({
  zhihu: async () => {
    const url = "https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=20&desktop=true"
    const res: Res = await myFetch(url)
    
    return res.data.map((k) => {
      return {
        id: k.target.link.url.match(/(\d+)$/)?.[1] ?? k.target.link.url,
        title: k.target.title_area.text,
        extra: {
          info: k.target.metrics_area.text,
          hover: k.target.excerpt_area.text,
        },
        url: k.target.link.url,
      }
    })
  },
})
```

### 4. 缓存系统架构 (server/database/cache.ts)

```typescript
import type { NewsItem } from "@shared/types"
import type { Database } from "db0"
import type { CacheInfo, CacheRow } from "../types"

export class Cache {
  private db
  
  constructor(db: Database) {
    this.db = db
  }
  
  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS cache (
        id TEXT PRIMARY KEY,
        updated INTEGER,
        data TEXT
      );
    `).run()
  }
  
  async set(key: string, value: NewsItem[]) {
    const now = Date.now()
    await this.db.prepare(
      `INSERT OR REPLACE INTO cache (id, data, updated) VALUES (?, ?, ?)`,
    ).run(key, JSON.stringify(value), now)
  }
  
  async get(key: string): Promise<CacheInfo | undefined> {
    const row = (await this.db.prepare(`SELECT id, data, updated FROM cache WHERE id = ?`).get(key)) as CacheRow | undefined
    if (row) {
      return {
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data),
      }
    }
  }
  
  async getEntire(keys: string[]): Promise<CacheInfo[]> {
    const keysStr = keys.map(k => `id = '${k}'`).join(" or ")
    const res = await this.db.prepare(`SELECT id, data, updated FROM cache WHERE ${keysStr}`).all() as any
    const rows = (res.results ?? res) as CacheRow[]
    
    return rows.map(row => ({
      id: row.id,
      updated: row.updated,
      items: JSON.parse(row.data) as NewsItem[],
    }))
  }
  
  async delete(key: string) {
    return await this.db.prepare(`DELETE FROM cache WHERE id = ?`).run(key)
  }
}

export async function getCacheTable() {
  try {
    const db = useDatabase()
    if (process.env.ENABLE_CACHE === "false") return
    const cacheTable = new Cache(db)
    if (process.env.INIT_TABLE !== "false") await cacheTable.init()
    return cacheTable
  } catch (e) {
    logger.error("failed to init database ", e)
  }
}
```

### 5. 核心 API 接口 (server/api/s/index.ts)

#### 5.1 单个源获取接口

```typescript
import type { SourceID, SourceResponse } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import type { CacheInfo } from "#/types"

export default defineEventHandler(async (event): Promise<SourceResponse> => {
  try {
    const query = getQuery(event)
    const latest = query.latest !== undefined && query.latest !== "false"
    let id = query.id as SourceID
    
    const isValid = (id: SourceID) => !id || !sources[id] || !getters[id]
    if (isValid(id)) {
      const redirectID = sources?.[id]?.redirect
      if (redirectID) id = redirectID
      if (isValid(id)) throw new Error("Invalid source id")
    }
    
    const cacheTable = await getCacheTable()
    const now = Date.now()
    let cache: CacheInfo | undefined
    
    if (cacheTable) {
      cache = await cacheTable.get(id)
      if (cache) {
        // 1. 刷新间隔检查：如果距离上次更新小于源的间隔，直接返回缓存
        if (now - cache.updated < sources[id].interval) {
          return {
            status: "success",
            id,
            updatedTime: now,
            items: cache.items,
          }
        }
        
        // 2. 缓存失效时间检查：如果距离上次更新小于 TTL，且不是最新请求或用户未登录，返回缓存
        if (now - cache.updated < TTL) {
          if (!latest || (!event.context.disabledLogin && !event.context.user)) {
            return {
              status: "cache",
              id,
              updatedTime: cache.updated,
              items: cache.items,
            }
          }
        }
      }
    }
    
    try {
      // 3. 抓取新数据
      const newData = (await getters[id]()).slice(0, 30)
      
      if (cacheTable && newData.length) {
        if (event.context.waitUntil) {
          event.context.waitUntil(cacheTable.set(id, newData))
        } else {
          await cacheTable.set(id, newData)
        }
      }
      
      return {
        status: "success",
        id,
        updatedTime: now,
        items: newData,
      }
    } catch (e) {
      // 抓取失败时返回缓存数据
      if (cache!) {
        return {
          status: "cache",
          id,
          updatedTime: cache.updated,
          items: cache.items,
        }
      } else {
        throw e
      }
    }
  } catch (e: any) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})
```

#### 5.2 批量获取缓存接口 (server/api/s/entire.post.ts)

```typescript
import type { SourceID, SourceResponse } from "@shared/types"
import { getCacheTable } from "#/database/cache"

export default defineEventHandler(async (event) => {
  try {
    const { sources: _ }: { sources: SourceID[] } = await readBody(event)
    const cacheTable = await getCacheTable()
    const ids = _?.filter(k => sources[k])
    if (ids?.length && cacheTable) {
      const caches = await cacheTable.getEntire(ids)
      const now = Date.now()
      return caches.map(cache => ({
        status: "cache",
        id: cache.id,
        items: cache.items,
        updatedTime: now - cache.updated < sources[cache.id].interval ? now : cache.updated,
      })) as SourceResponse[]
    }
  } catch {
    //
  }
})
```

> **重要说明：**
> 该端点目前仅从缓存读取数据，不涉及实际抓取，因此：
> 1. 没有使用代理配置逻辑
> 2. 与 `staggerRefresh` 逻辑完全脱节
> 3. 当缓存失效需要刷新时，无法正确应用代理配置和并发限制策略
> 4. 目前依赖该端点的业务存在问题，需要将来重构或调整

### 6. 获取器管理 (server/getters.ts)

```typescript
import type { SourceID } from "@shared/types"
import * as x from "glob:./sources/{*.ts,**/index.ts}"
import type { SourceGetter } from "./types"

export const getters = (function () {
  const getters = {} as Record<SourceID, SourceGetter>
  typeSafeObjectEntries(x).forEach(([id, x]) => {
    if (x.default instanceof Function) {
      Object.assign(getters, { [id]: x.default })
    } else {
      Object.assign(getters, x.default)
    }
  })
  return getters
})()
```

### 7. 按新闻源配置代理功能

这个功能允许对每个新闻源单独配置是否使用代理访问，使用现有的缓存表存储配置。

> **重要说明：**
> 1. 此功能与原项目中的 `proxySource` 函数无关。`proxySource` 是原项目用于 Cloudflare Pages 部署的代理方案，而本章节描述的是我们 fork 后新增的按源配置代理功能。
> 2. **线程安全问题（严重）**：当前实现使用全局变量 `currentUseProxy` 存储代理状态，在并发请求环境下会导致配置混乱，需要将来修复。建议使用 Nitro/H3 的 `event.context` 存储代理状态，或重构 `myFetch` 函数使其接收代理配置作为参数。

#### 7.1 缓存表扩展 (server/database/cache.ts)

在原有的 `cache` 表中新增了 `useProxy` 列来存储每个源的代理配置：

```typescript
async init() {
  await this.db.prepare(`
    CREATE TABLE IF NOT EXISTS cache (
      id TEXT PRIMARY KEY,
      updated INTEGER,
      data TEXT,
      useProxy INTEGER DEFAULT 0
    );
  `).run()
  logger.success(`init cache table`)
}

// 新增方法：获取单个源的代理配置
async getUseProxy(id: string): Promise<boolean> {
  const row = (await this.db.prepare(`SELECT useProxy FROM cache WHERE id = ?`).get(id)) as { useProxy: number } | undefined
  // 如果没有记录或者 useProxy 为 NULL，默认返回 false
  return row && row.useProxy === 1 ? true : false
}

// 新增方法：设置单个源的代理配置
async setUseProxy(id: string, useProxy: boolean) {
  // 先查询是否存在
  const exists = await this.db.prepare(`SELECT id FROM cache WHERE id = ?`).get(id)

  if (exists) {
    // 存在，更新
    await this.db.prepare(
      `UPDATE cache SET useProxy = ? WHERE id = ?`,
    ).run(useProxy ? 1 : 0, id)
  } else {
    // 不存在，插入新行
    await this.db.prepare(
      `INSERT INTO cache (id, useProxy) VALUES (?, ?)`,
    ).run(id, useProxy ? 1 : 0)
  }
  logger.success(`set ${id} useProxy: ${useProxy}`)
}

// 新增方法：获取所有源的代理配置
async getAllUseProxy(): Promise<Partial<Record<string, boolean>>> {
  const res = await this.db.prepare(`SELECT id, useProxy FROM cache WHERE useProxy IS NOT NULL`).all() as any
  const rows = (res.results ?? res) as { id: string; useProxy: number }[]
  const result: Partial<Record<string, boolean>> = {}
  rows.forEach(row => {
    result[row.id] = row.useProxy === 1
  })
  return result
}
```

同时，修改了原有的 `set` 方法，从 `INSERT OR REPLACE` 改为先检查后更新/插入，避免覆盖已有的 `useProxy` 配置：

```typescript
async set(id: string, value: NewsItem[]) {
  const now = Date.now()
  // 先查询是否存在
  const exists = await this.db.prepare(`SELECT id FROM cache WHERE id = ?`).get(id)

  if (exists) {
    // 存在，更新，保留 useProxy
    await this.db.prepare(
      `UPDATE cache SET data = ?, updated = ? WHERE id = ?`,
    ).run(JSON.stringify(value), now, id)
  } else {
    // 不存在，插入新行，useProxy 默认为 0
    await this.db.prepare(
      `INSERT INTO cache (id, data, updated, useProxy) VALUES (?, ?, ?, 0)`,
    ).run(id, JSON.stringify(value), now)
  }
  logger.success(`set ${id} cache`)
}
```

#### 7.2 代理配置 API (server/api/source-proxy/index.ts)

新增 API 接口用于读取和设置源的代理配置：

```typescript
import type { SourceID } from "@shared/types"
import { getCacheTable } from "#/database/cache"

export default defineEventHandler(async (event) => {
  try {
    const cacheTable = await getCacheTable()
    if (!cacheTable) {
      throw createError({
        statusCode: 500,
        message: "Cache database not available",
      })
    }

    // GET 请求：读取配置
    if (event.method === "GET") {
      const query = getQuery(event)
      const id = query.id as SourceID
      if (id) {
        // 读取单个源的配置
        const useProxy = await cacheTable.getUseProxy(id)
        return { id, useProxy }
      } else {
        // 读取所有源的配置
        const all = await cacheTable.getAllUseProxy()
        return { all }
      }
    }
    // POST 请求：设置配置
    else if (event.method === "POST") {
      const body = await readBody(event)
      const { id, useProxy } = body as { id: SourceID; useProxy: boolean }
      if (!id || typeof useProxy !== "boolean") {
        throw createError({
          statusCode: 400,
          message: "Invalid request body",
        })
      }
      await cacheTable.setUseProxy(id, useProxy)
      return { success: true, id, useProxy }
    }
  } catch (e) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})
```

**API 使用示例：**

```bash
# 1. 设置 hackernews 使用代理
curl -X POST http://localhost:3000/api/source-proxy \
  -H "Content-Type: application/json" \
  -d '{"id":"hackernews","useProxy":true}'

# 2. 查询单个源的配置
curl "http://localhost:3000/api/source-proxy?id=hackernews"
# 返回: {"id":"hackernews","useProxy":true}

# 3. 查询所有源的配置
curl "http://localhost:3000/api/source-proxy"
# 返回: {"all":{"hackernews":true,"reddit":false,...}}
```

#### 7.3 Fetch 工具重构 (server/utils/fetch.ts)

重构了统一请求工具，提供直连和代理两种方式，并通过上下文动态选择：

```typescript
import process from "node:process"
import { $fetch } from "ofetch"
import type { $Fetch } from "ofetch"

// 上下文变量：当前是否使用代理
let currentUseProxy = false

// 导出：设置当前上下文的代理状态
export function setCurrentFetch(useProxy: boolean) {
  logger.info(`[proxy] setCurrentFetch: ${useProxy}`)
  currentUseProxy = useProxy
}

// 内部：根据上下文返回对应的 fetch 实例
function getCurrentFetch() {
  return currentUseProxy ? myFetchProxy : myFetchDirect
}

// 尝试从环境变量获取代理配置
const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || process.env.PROXY || process.env.proxy
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.PROXY || process.env.proxy

// 存储 dispatcher（延迟初始化）
let dispatcher: any = null

// 初始化 dispatcher（只执行一次）
let dispatcherInitialized = false
async function initDispatcher() {
  if (dispatcherInitialized) return
  dispatcherInitialized = true

  if (!httpProxy && !httpsProxy) return

  try {
    // 动态导入 undici
    const undici = await import("undici" as any)

    // 优先尝试 EnvHttpProxyAgent（自动读取环境变量）
    if ("EnvHttpProxyAgent" in undici) {
      dispatcher = new undici.EnvHttpProxyAgent()
      logger.info("[proxy] 使用 EnvHttpProxyAgent 配置代理")
    } else if ("ProxyAgent" in undici) {
      // 否则使用 ProxyAgent，优先使用 HTTPS_PROXY
      const proxyUrl = httpsProxy || httpProxy
      if (proxyUrl) {
        dispatcher = new undici.ProxyAgent(proxyUrl)
        logger.info(`[proxy] 使用 ProxyAgent 配置代理: ${proxyUrl}`)
      }
    }
  } catch (e) {
    logger.warn("[proxy] 无法加载 undici，代理配置可能不生效:", e)
  }
}

// 直连 fetch（不使用代理）
export const myFetchDirect = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
})

// 代理 fetch（使用代理）
export const myFetchProxy = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
  async onRequest({ options }) {
    await initDispatcher()
    if (dispatcher) {
      options.dispatcher = dispatcher
    }
  },
})

// 默认 myFetch，使用上下文决定，通过 Proxy 实现
export const myFetch = new Proxy(myFetchDirect, {
  apply(_target, thisArg, args) {
    const fetchFn = getCurrentFetch()
    logger.debug(`[proxy] using fetch: ${fetchFn === myFetchProxy ? 'proxy' : 'direct'}`)
    return Reflect.apply(fetchFn as any, thisArg, args)
  },
}) as $Fetch
```

**设计要点：**
1. 提供两个独立的 fetch 实例：`myFetchDirect`（直连）和 `myFetchProxy`（代理）
2. 通过 `currentUseProxy` 变量存储当前上下文的代理状态
3. 使用 `Proxy` 包装默认的 `myFetch`，每次调用时根据上下文动态选择
4. 代理 dispatcher 采用延迟初始化，避免不必要的模块导入

#### 7.4 核心 API 集成 (server/api/s/index.ts)

在获取单个源数据时，先读取该源的代理配置并设置上下文：

```typescript
import type { SourceID, SourceResponse } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { setCurrentFetch } from "#/utils/fetch"  // 新增导入
import type { CacheInfo } from "#/types"

export default defineEventHandler(async (event): Promise<SourceResponse> => {
  try {
    const query = getQuery(event)
    const latest = query.latest !== undefined && query.latest !== "false"
    let id = query.id as SourceID
    
    const isValid = (id: SourceID) => !id || !sources[id] || !getters[id]
    if (isValid(id)) {
      const redirectID = sources?.[id]?.redirect
      if (redirectID) id = redirectID
      if (isValid(id)) throw new Error("Invalid source id")
    }
    
    // 新增：获取该源的代理配置并设置上下文
    const cacheTable = await getCacheTable()
    let useProxy = false
    if (cacheTable) {
      useProxy = await cacheTable.getUseProxy(id)
    }
    setCurrentFetch(useProxy)
    
    // 后续原有逻辑...
  }
})
```

#### 7.5 前端 UI 实现

用户可以在每个新闻源卡片右上角直观地切换代理状态。

##### 7.5.1 自定义 Hook (src/hooks/useProxy.ts)

使用 React Query 管理代理配置状态，提供乐观更新和错误回滚功能：

```typescript
import type { SourceID } from "@shared/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { myFetch } from "~/utils"

export function useProxyConfig(id: SourceID) {
  const queryClient = useQueryClient()

  // 获取代理配置
  const { data: useProxy, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["proxy", id],
    queryFn: async () => {
      const res = await myFetch("/source-proxy", {
        query: { id },
      })
      return res.useProxy ?? false
    },
    staleTime: Infinity,
  })

  // 更新代理配置
  const { mutate: _setProxy, isPending, isError } = useMutation({
    mutationFn: async (newValue: boolean) => {
      await myFetch("/source-proxy", {
        method: "POST",
        body: { id, useProxy: newValue },
        timeout: 1000,  // 1秒超时，快速反馈
      })
      return newValue
    },
    onMutate: async (newValue) => {
      // 乐观更新：先更新 UI
      await queryClient.cancelQueries({ queryKey: ["proxy", id] })
      const previousValue = queryClient.getQueryData(["proxy", id])
      queryClient.setQueryData(["proxy", id], newValue)
      return { previousValue }
    },
    onError: (_err, _newValue, context) => {
      // 失败回滚
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(["proxy", id], context.previousValue)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["proxy", id] })
    },
  })

  const setProxy = useCallback(
    (newValue: boolean, options?: { onError?: () => void }) => {
      _setProxy(newValue, {
        onError: options?.onError,
      })
    },
    [_setProxy],
  )

  const toggleProxy = useCallback(
    (options?: { onError?: () => void }) => {
      if (isPending) return
      setProxy(!useProxy, options)
    },
    [isPending, setProxy, useProxy],
  )

  return {
    useProxy: useProxy ?? false,
    isLoading: isLoadingConfig,
    isPending,
    isError,
    toggleProxy,
    setProxy,
  }
}
```

##### 7.5.2 新闻卡片集成 (src/components/column/card.tsx)

在新闻源卡片右上角添加代理按钮，按钮位置顺序为：`[代理按钮] → [刷新按钮] → [关注按钮]`。

**加载优先级：**
1. 卡片进入可视区后，优先加载代理配置
2. 代理按钮在配置加载完前隐藏，避免误导用户
3. 代理配置加载完后，再开始请求新闻源数据

```typescript
function NewsCard({ id, setHandleRef }: NewsCardProps) {
  const { refresh } = useRefetch()
  // 先获取代理配置（优先加载）
  const { useProxy, isLoading: isLoadingProxy, isPending, toggleProxy } = useProxyConfig(id)
  const toast = useToast()

  // 新闻源数据请求，等代理配置加载完才执行
  const { data, isFetching, isError } = useQuery({
    queryKey: ["source", id],
    queryFn: async () => { /* ...原有逻辑... */ },
    placeholderData: prev => prev,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    enabled: !isLoadingProxy && useProxy !== undefined,  // 代理配置加载完才启用
  })

  const handleProxyToggle = useCallback(() => {
    toggleProxy({
      onError: () => {
        toast("代理flag设置失败,请稍后重试", { type: "error" })
      },
    })
  }, [toggleProxy, toast])

  return (
    <div>
      <div className="buttons">
        {/* 代理按钮：等配置加载完才显示 */}
        {!isLoadingProxy && useProxy !== undefined && (
          <button
            type="button"
            disabled={isPending}
            className={$("btn", isPending ? "i-ph:paper-plane-tilt-duotone animate-pulse" : useProxy ? "i-ph:paper-plane-tilt-fill" : "i-ph:paper-plane-tilt-duotone")}
            onClick={handleProxyToggle}
            title={useProxy ? "当前使用代理访问" : "当前直连访问"}
          />
        )}
        {/* 刷新按钮和关注按钮 */}
        <button />
        <button />
      </div>
    </div>
  )
}
```

**按钮图标说明：**
- ✈️ **useProxy=true（代理）**：`i-ph:paper-plane-tilt-fill`（实心纸飞机）
- 🟢 **useProxy=false（直连）**：`i-ph:paper-plane-tilt-duotone`（空心纸飞机）
- ⏳ **加载中**：`i-ph:paper-plane-tilt-duotone animate-pulse`（脉冲动画）
- 配置加载完成前：按钮隐藏，避免误导

### 8. 数据库支持

#### 8.1 支持的数据库
- **SQLite**：本地开发和 Docker 部署
- **Cloudflare D1**：推荐的生产部署方案
- **其他**：通过 DB0 支持多种数据库（PostgreSQL、MySQL、MongoDB 等）

#### 8.2 数据库配置

**Cloudflare D1 配置 (wrangler.toml)**：
```toml
name = "newsnow"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "newsnow-db"
database_id = "your-database-id"
```

### 9. 抓取策略优化

#### 9.1 动态刷新间隔
- 每个新闻源可配置不同的刷新间隔（interval 属性）
- 热门源（如微博）刷新间隔短（2分钟）
- 冷门源刷新间隔长（10分钟或更久）
- 服务器会根据源的更新频率自动调整

#### 9.2 缓存机制
- **TTL 缓存**：默认 30 分钟，在时间范围内即使内容更新也返回缓存
- **强制刷新**：登录用户可通过 `?latest=true` 参数强制获取最新数据
- **智能缓存**：在刷新间隔内返回缓存，超过间隔才重新抓取

#### 9.3 防封禁策略
- 统一的 User-Agent 头部
- 可配置的请求间隔
- 错误重试机制
- 代理支持（通过 environment variables 配置）

### 10. 扩展与维护

#### 10.1 添加新的新闻源
1. 在 `server/sources/` 目录下创建新的解析器文件
2. 使用 `defineSource` 函数定义源抓取函数
3. 在 `shared/sources.json` 中添加源配置
4. 可选：在 `public/icons/` 目录下添加源图标

#### 10.2 源解析器开发模板

```typescript
import type { NewsItem } from "@shared/types"
import { load } from "cheerio"

const mySource = defineSource(async () => {
  const url = "https://example.com/news"
  const response = await myFetch(url)
  const $ = load(response)
  const news: NewsItem[] = []
  
  // 解析逻辑
  $(".news-item").each((_, el) => {
    const title = $(el).find(".title").text()
    const link = $(el).find("a").attr("href")
    
    if (title && link) {
      news.push({
        id: link,
        title: title.trim(),
        url: new URL(link, "https://example.com").toString(),
      })
    }
  })
  
  return news
})

export default defineSource({
  "my-source": mySource,
})
```

## 自定义新闻源添加流程

### 东方财富快讯源实现案例

#### 1. 背景分析
东方财富网（EastMoney）是中国领先的财经信息网站，提供实时财经新闻和股票市场信息。我们需要实现一个自定义源来获取其7×24小时快讯。

#### 2. API接口发现与测试
通过网络分析发现东方财富的快讯API接口：
```
https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=50&req_trace=${timestamp}&_=${timestamp}
```
该接口返回`fastNewsList`字段，包含完整的新闻列表数据。

#### 3. 实现步骤

##### 3.1 创建源解析器
在 `server/sources/` 目录下创建新的源解析器文件 `eastmoney.ts`：

```typescript
import type { NewsItem } from "@shared/types"

interface FastNewsItem {
  code: string
  image: any[]
  pinglun_Num: number
  realSort: string
  share: number
  showTime: string
  stockList: any[]
  summary: string
  title: string
  titleColor: number
}

interface FastNewsResponse {
  code: string
  data: {
    fastNewsList: FastNewsItem[]
  }
  message: string
}

export default defineSource({
  "eastmoney": async () => {
    // 使用东方财富的API接口获取快讯数据
    const timestamp = Date.now()
    const apiUrl = `https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=50&req_trace=${timestamp}&_=${timestamp}`
    
    // 直接使用项目提供的 myFetch 函数
    const res: FastNewsResponse = await myFetch(apiUrl)
    
    // 检查接口返回是否成功
    if (res.code === "1" && res.data?.fastNewsList) {
      return res.data.fastNewsList.map((item) => {
        // 转换日期格式 (YYYY-MM-DD HH:MM:SS 到 timestamp)
        const pubDate = new Date(item.showTime).getTime()
        
        return {
          id: item.code,
          title: item.title,
          url: `https://finance.eastmoney.com/a/${item.code}.html`,
          pubDate,
          extra: {
            hover: item.summary, // 摘要信息
            date: pubDate, // 发布时间
          },
        }
      }).slice(0, 30)
    }
    
    // 如果API失败，返回空数组
    return []
  },
})
```

##### 3.2 更新源配置
在 `shared/pre-sources.ts` 文件中添加东方财富源的配置：

```typescript
  "eastmoney": {
    name: "东方财富",
    type: "realtime",
    column: "finance",
    home: "https://kuaixun.eastmoney.com",
    color: "red",
    interval: 600000,
    title: "财经快讯"
  },
```

##### 3.3 生成配置文件
运行以下命令重新生成 `sources.json` 和 `pinyin.json`：
```bash
pnpm presource
```

##### 3.4 验证功能
启动开发服务器并测试源是否正常工作：
```bash
pnpm dev
```

在浏览器中访问 `http://localhost:5173` 验证功能，或直接测试 API 接口：
```bash
# 测试 API 接口
curl -X GET "http://localhost:5173/api/s?id=eastmoney&latest=true" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
```

成功返回的响应示例：
```json
{
  "status": "success",
  "id": "eastmoney",
  "updatedTime": 1776740000000,
  "items": [
    {
      "id": "202604213711993445",
      "title": "荣耀夺冠机器人“空间神经末梢”由深圳纽瑞芯提供",
      "url": "https://finance.eastmoney.com/a/202604213711993445.html",
      "pubDate": 1776739140000,
      "extra": {
        "hover": "【荣耀夺冠机器人“空间神经末梢”由深圳纽瑞芯提供】记者获悉，“闪电”机器人的“神经末梢” UWB(Ultra Wide Band，超宽带)由深圳市纽瑞芯科技有限公司提供。纽瑞芯科技总部设于深圳市龙岗区天安云谷产业园，在北京、苏州等均设有研发中心；专注于无线通信系统芯片的核心技术研发及产业化，为智能手机、智能汽车、物联网及工业互联网市场，提供核心芯片和系统解决方案。",
        "date": 1776739140000
      }
    }
  ]
}
```

#### 4. 实现要点总结

##### 4.1 编码问题解决
- 回归简单实现，直接使用项目提供的 myFetch 函数
- 避免手动编码处理导致的问题
- 确保 API 响应直接传递到客户端

##### 4.2 链接格式修正
- 修正了新闻链接格式，从 `https://kuaixun.eastmoney.com/news,${code}.html` 改为 `https://finance.eastmoney.com/a/${code}.html`
- 该格式符合东方财富网的实际新闻页面 URL 结构

##### 4.3 数据结构解析
- 正确解析了东方财富 API 返回的数据结构
- 提取了标题、内容摘要、发布时间等关键信息
- 实现了日期格式转换和数据验证

##### 4.4 错误处理
- 添加了 API 响应状态检查
- 实现了接口失败时的回退机制
- 确保应用程序在获取数据失败时不会崩溃

#### 5. 项目集成说明

##### 5.1 文件修改
- 新增了 `server/sources/eastmoney.ts` - 源解析器文件
- 更新了 `shared/pre-sources.ts` - 源配置文件
- 通过 `pnpm presource` 命令自动生成了 `sources.json` 和 `pinyin.json`

##### 5.2 源属性配置
| 属性 | 值 | 说明 |
|------|-----|------|
| name | 东方财富 | 源的显示名称 |
| type | realtime | 实时新闻类型 |
| column | finance | 财经分类 |
| home | https://kuaixun.eastmoney.com | 主页链接 |
| color | red | 主题颜色（红色） |
| interval | 600000 | 刷新间隔（10分钟） |
| title | 财经快讯 | 源标题 |

##### 5.3 部署建议
- 源已支持 Cloudflare Pages 部署（未设置 `disable: "cf"`）
- 可通过 `environment variables` 配置缓存和数据库参数
- 建议使用 Cloudflare D1 数据库进行生产部署

通过以上实现，我们成功添加了东方财富快讯源到 NewsNow 应用中，解决了编码问题并修正了链接格式，确保用户能够正常访问和阅读东方财富的财经新闻。

### 自定义新闻源开发规范

#### 1. 文件结构规范

##### 1.1 源解析器文件
- 文件位置：`server/sources/<source-id>.ts`
- 文件名与源 ID 保持一致
- 使用 `defineSource` 函数定义源
- 支持单个或多个源配置

##### 1.2 源配置文件
- 文件位置：`shared/pre-sources.ts`
- 添加源的元数据信息
- 支持子源配置（sub 属性）
- 定义源的显示属性

#### 2. 开发流程

##### 2.1 基本流程
1. 确定源的基本信息（名称、类型、颜色、间隔等）
2. 分析源的 API 接口或页面结构
3. 创建源解析器文件
4. 在 pre-sources.ts 中添加配置
5. 运行 `pnpm presource` 生成配置
6. 测试功能

##### 2.2 API 接口分析
- 使用浏览器开发者工具分析网络请求
- 测试 API 接口的稳定性和数据结构
- 处理接口返回的数据格式

##### 2.3 数据解析
- 对于 JSON API，直接解析响应数据
- 对于 HTML 页面，使用 cheerio 进行解析
- 处理字符编码和日期格式问题

#### 3. 最佳实践

##### 3.1 错误处理
```typescript
// API 响应检查
if (res.code === "1" && res.data?.fastNewsList) {
  // 数据处理逻辑
}

// 编码转换错误处理
try {
  if (title.match(/[^\x00-\x7F]/)) {
    title = Buffer.from(title, 'latin1').toString('utf8')
  }
} catch (error) {
  console.error('编码转换错误:', error)
}
```

##### 3.2 数据验证
```typescript
// 检查必填字段
if (!item.title || !item.code) {
  continue // 跳过无效条目
}

// 限制返回数量
return results.slice(0, 30)
```

##### 3.3 性能优化
- 使用适当的请求间隔（interval）
- 避免频繁请求 API
- 实现缓存机制

## 我的钢铁（Mysteel）快讯源开发

### 1. 背景分析
我的钢铁网（Mysteel）是中国领先的钢铁行业信息服务平台，提供钢铁市场动态、价格走势、行业分析等实时资讯。我们需要实现一个自定义源来获取其快讯板块的内容。

### 2. API接口发现与测试
通过网络分析发现我的钢铁的快讯API接口：
```
https://openapi.mysteel.com/without_sign/newsflash/flashnews/query_by_tags.htm
```
该接口返回JSON格式数据，包含完整的新闻列表。

### 3. 实现步骤

#### 3.1 创建源解析器
在 `server/sources/` 目录下创建新的源解析器文件 `mysteel.ts`：

```typescript
import type { NewsItem } from "@shared/types"

interface MySteelNewsItem {
  id: number
  categoryId: number
  sectionId: number
  content: string
  relationBreedId: string
  relationBreed: { name: string; id: string }[]
  relationCityId: string
  relationCity: any[]
  relationFactoryId: string
  relationFactory: { name: string; id: number }[]
  relationPortId: string
  relationPort: { name: string; id: number }[]
  inArticleTitle: string
  inArticleUrl: string
  outArticleTitle: string
  outArticleUrl: string
  source: string
  imageUrl: any[]
  publisherTime: number
  dataSource: number
  relationId: number
  inArticleAid: number
  outArticleAid: number
  shareImageUrl: string
  wapRestrict: boolean
  wapResidualWords: string | null
  sectionName: string
  categoryName: string
  voiceUrl: string
  readingCount: any
  advertisementFlag: number
  breedTags: string[]
  breedTagIdNames: { name: string; id: string }[]
  publisherId: number
  relationActivityId: number
  aiFlag: number
}

interface MySteelResponse {
  pageNo: number
  pageSize: number
  total: number
  totalPage: number
  isValid: boolean
  list: MySteelNewsItem[]
}

export default defineSource({
  "mysteel": async () => {
    // 使用我的钢铁的API接口获取快讯数据
    const apiUrl = "https://openapi.mysteel.com/without_sign/newsflash/flashnews/query_by_tags.htm"
    
    // 直接使用项目提供的 myFetch 函数
    const res: MySteelResponse = await myFetch(apiUrl)
    
    // 检查接口返回是否成功
    if (res.isValid && res.list) {
      return res.list.map((item) => {
        // 转换日期格式 (timestamp 到 Date)
        const pubDate = item.publisherTime
        
        return {
          id: item.id.toString(),
          title: item.content, // 内容作为标题
          url: item.inArticleUrl || item.outArticleUrl, // 优先使用内文链接，否则使用外文链接
          pubDate,
          extra: {
            date: pubDate, // 发布时间
            info: item.breedTags.join(", "), // 品种标签
          },
        }
      }).slice(0, 30)
    }
    
    // 如果API失败，返回空数组
    return []
  },
})
```

#### 3.2 更新源配置
在 `shared/pre-sources.ts` 文件中添加我的钢铁源的配置：

```typescript
  "mysteel": {
    name: "我的钢铁",
    type: "realtime",
    column: "finance",
    home: "https://www.mysteel.com",
    color: "blue",
    interval: Time.Fast,
    title: "钢铁快讯"
  },
```

#### 3.3 生成配置文件
运行以下命令重新生成 `sources.json` 和 `pinyin.json`：
```bash
pnpm presource
```

### 4. 功能特点
- 实时获取钢铁行业快讯
- 显示新闻内容和发布时间
- 标签化显示相关品种信息（如螺纹钢、盘螺、线材等）
- 支持响应式设计，适配不同屏幕尺寸
- 集成到金融分类页面

### 5. 验证功能
启动开发服务器并测试源是否正常工作：
```bash
pnpm dev
```

在浏览器中访问 `http://localhost:5173` 验证功能，或直接测试 API 接口：
```bash
# 测试 API 接口
curl -X GET "http://localhost:5173/api/s?id=mysteel&latest=true" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
```

成功返回的响应示例：
```json
{
  "status": "success",
  "id": "mysteel",
  "updatedTime": 1776740000000,
  "items": [
    {
      "id": "4556557",
      "title": "4月21日宝武新钢发布南昌市场定价:螺纹3070元/吨，线材3360元/吨，盘螺3360元/吨。",
      "url": "",
      "pubDate": 1776783302810,
      "extra": {
        "date": 1776783302810,
        "info": "螺纹钢,盘螺,线材"
      }
    }
  ]
}
```

## 界面新闻（Jiemian）快讯源开发

### 1. 背景分析
界面新闻（Jiemian）是中国领先的财经资讯平台，提供实时财经新闻和市场动态。我们需要实现一个自定义源来获取其快讯板块的内容。

### 2. API接口发现与测试
通过网络分析发现界面新闻的快讯API接口：
```
https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1323kb&start_time=1776789031&page=1&tagid=1323
```
该接口返回JSON格式数据，包含完整的新闻列表。需要注意的是，`start_time` 参数需要使用当前Unix时间戳（秒）。

### 3. 实现步骤

#### 3.1 创建源解析器
在 `server/sources/` 目录下创建新的源解析器文件 `jiemian.ts`：

```typescript
import type { NewsItem } from "@shared/types"

interface JiemianNewsItem {
  id: string
  publishtime: string
  title: string
  summary: string
  weights: string
  h5_href: string
  is_original: string
  is_make_img: string
  img_urls: any[]
  edit_cms: number
  blackwhite: string
}

interface JiemianResponse {
  code: string
  message: string
  user_status: {
    status: number
    title: string
    content: string
  }
  result: {
    hideBtn: boolean
    list: JiemianNewsItem[]
  }
}

export default defineSource({
  "jiemian": async () => {
    // 使用界面新闻的API接口获取快讯数据
    const timestamp = Math.floor(Date.now() / 1000) // 当前Unix时间戳（秒）
    const apiUrl = `https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1323kb&start_time=${timestamp}&page=1&tagid=1323`
    
    // 直接使用项目提供的 myFetch 函数
    const res: JiemianResponse = await myFetch(apiUrl)
    
    // 检查接口返回是否成功
    if (res.code === "0" && res.result?.list) {
      return res.result.list.map((item) => {
        // 转换日期格式 (string to timestamp)
        const pubDate = parseInt(item.publishtime) * 1000 // 转换为毫秒
        
        return {
          id: item.id,
          title: item.title,
          url: `https://www.jiemian.com/article/${item.id}.html`, // 使用id构建文章链接
          pubDate,
          extra: {
            hover: item.summary, // 摘要信息
            date: pubDate, // 发布时间
          },
        }
      }).slice(0, 30)
    }
    
    // 如果API失败，返回空数组
    return []
  },
})
```

#### 3.2 更新源配置
在 `shared/pre-sources.ts` 文件中添加界面新闻源的配置：

```typescript
  "jiemian": {
    name: "界面新闻",
    type: "realtime",
    column: "china",
    home: "https://www.jiemian.com",
    color: "blue",
    sub: {
      quick: {
        title: "即时资讯",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true // 启用错开刷新，避免并发请求被限制
      },
      todayhot: {
        title: "今日热点",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true
      },
      company: {
        title: "公司头条",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true
      },
      stock: {
        title: "股市前沿",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true
      },
      regulatory: {
        title: "监管通报",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true
      },
      finance: {
        title: "财经速览",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true
      },
      affairs: {
        title: "时事追踪",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true
      },
    },
  },
```

**注意**：
- 主源不应该有 `title` 和 `interval`，这些配置放在子源里
- 所有子源都设置 `staggerRefresh: true`，在全体刷新时会按顺序处理，每个源间隔 1 秒，避免并发请求被限制

#### 3.3 生成配置文件
运行以下命令重新生成 `sources.json` 和 `pinyin.json`：
```bash
pnpm presource
```

### 4. 功能特点
- 实时获取财经类快讯
- 显示新闻标题和摘要信息
- 支持响应式设计，适配不同屏幕尺寸
- 集成到中国分类页面
- 使用高频刷新间隔（每30秒）

### 5. 新增板块功能
除了默认的即时资讯板块，我们还为界面新闻添加了以下六个子板块：

#### 5.1 今日热点 (jiemian-todayhot)
- 接口：`https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1324kb&start_time={timestamp}&page=1&tagid=1324`
- 内容：每日热点新闻
- 更新频率：实时

#### 5.2 公司头条 (jiemian-company)
- 接口：`https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1322kb&start_time={timestamp}&page=1&tagid=1322`
- 内容：公司相关新闻
- 更新频率：实时

#### 5.3 股市前沿 (jiemian-stock)
- 接口：`https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1327kb&start_time={timestamp}&page=1&tagid=1327`
- 内容：股票市场新闻
- 更新频率：实时

#### 5.4 监管通报 (jiemian-regulatory)
- 接口：`https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1330kb&start_time={timestamp}&page=1&tagid=1330`
- 内容：监管部门通报
- 更新频率：实时

#### 5.5 财经速览 (jiemian-finance)
- 接口：`https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1326kb&start_time={timestamp}&page=1&tagid=1326`
- 内容：财经新闻速览
- 更新频率：实时

#### 5.6 时事追踪 (jiemian-affairs)
- 接口：`https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=1325kb&start_time={timestamp}&page=1&tagid=1325`
- 内容：时事新闻追踪
- 更新频率：实时

### 6. 实现方式
我们将所有板块的实现放在了同一个 `jiemian.ts` 文件中，采用了与 `wallstreetcn.ts` 类似的架构：

```typescript
// 通用的界面新闻获取函数
const fetchJiemianNews = async (cid: string, tagid: string): Promise<NewsItem[]> => {
  const timestamp = Math.floor(Date.now() / 1000) // 当前Unix时间戳（秒）
  const apiUrl = `https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=${cid}&start_time=${timestamp}&page=1&tagid=${tagid}`
  
  const res: JiemianResponse = await myFetch(apiUrl)
  
  if (res.code === "0" && res.result?.list) {
    return res.result.list.map((item) => {
      const pubDate = parseInt(item.publishtime) * 1000
      
      return {
        id: item.id,
        title: item.title,
        url: `https://www.jiemian.com/article/${item.id}.html`, // 使用id构建文章链接
        pubDate,
        extra: {
          hover: item.summary,
          date: pubDate,
        },
      }
    }).slice(0, 30)
  }
  
  return []
}

// 各个板块的定义
const todayHot = defineSource(async () => {
  return await fetchJiemianNews("1324kb", "1324")
})
```

### 7. 验证功能
启动开发服务器并测试源是否正常工作：
```bash
pnpm dev
```

在浏览器中访问 `http://localhost:5173` 验证功能，或直接测试 API 接口：
```bash
# 测试 API 接口（以今日热点为例）
curl -X GET "http://localhost:5173/api/s?id=jiemian-todayhot&latest=true" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
```

成功返回的响应示例：
```json
{
  "status": "success",
  "id": "jiemian-todayhot",
  "updatedTime": 1776792000000,
  "items": [
    {
      "id": "14287887",
      "title": "美军称对一艘“伊朗油轮”进行检查",
      "url": "https://www.jiemian.com/article/14287887.html",
      "pubDate": 1776787243000,
      "extra": {
        "hover": "美国国防部4月21日在社交媒体发布消息称，美海军20日晚登上一艘“伊朗油轮”并检查。卫星跟踪数据显示，该油轮当时位于霍尔木兹海峡和阿拉伯海之间。消息称，这艘名为“苏莱曼尼”号的油轮“无国籍且受制裁”，美海军对该油轮实施了海上拦截并登船检查，全程未出现任何意外。消息还称，美海军将在“全球范围内开展海上执法行动”，拦截向伊朗“提供物资支持”的受制裁船只。据悉，该油轮“因运输伊朗原油”而遭到美国财政部制裁。",
        "date": 1776787243000
      }
    }
  ]
}
```

### 常见问题与解决方案

#### 1. 东财源刷新间隔限制问题
**问题**：项目启动后第一次点击刷新按钮时正常刷新，但之后就没反应。
**原因**：服务器端 API 路由中的刷新间隔限制。在 `server/api/s/index.ts` 文件中，有以下限制逻辑：

```typescript
// interval 刷新间隔，对于缓存失效也要执行的。本质上表示本来内容更新就很慢，这个间隔内可能内容压根不会更新。
if (now - cache.updated < sources[id].interval) {
  return {
    status: "success",
    id,
    updatedTime: now,
    items: cache.items,
  }
}
```

**解决方案**：调整源的刷新间隔设置。

1. 在 `shared/pre-sources.ts` 中修改 Time 对象：
```typescript
const Time = {
  Test: 1,
  Realtime: 0.5 * 60 * 1000, // 从 2分钟 改为 0.5分钟（30秒）
  Fast: 5 * 60 * 1000,
  Default: Interval, // 10min
  Common: 30 * 60 * 1000,
  Slow: 60 * 60 * 1000,
}
```

2. 为 EastMoney 源设置正确的刷新间隔：
```typescript
"eastmoney": {
  name: "东方财富",
  column: "finance",
  color: "red",
  type: "realtime",
  title: "财经快讯",
  interval: Time.Realtime, // 使用更短的刷新间隔
  home: "https://kuaixun.eastmoney.com",
},
```

3. 重新生成 sources.json 文件：
```bash
pnpm run presource
```

**效果**：现在东财源的刷新间隔从默认的 10分钟 改为 30秒，用户可以更频繁地获取最新数据。

#### 2. 编码问题
**问题**：API 返回的中文内容显示乱码
**解决**：使用 Buffer 进行编码转换
```typescript
let title = item.title
if (title.match(/[^\x00-\x7F]/)) {
  title = Buffer.from(title, 'latin1').toString('utf8')
}
```

#### 2. 日期格式转换
**问题**：API 返回的日期格式不符合需求
**解决**：使用 Date 对象进行转换
```typescript
const pubDate = new Date(item.showTime).getTime()
```

#### 3. API 访问限制
**问题**：API 接口有访问频率限制
**解决**：
- 设置合理的 interval 属性
- 实现请求重试机制
- 使用代理或 CDN 缓存

#### 4. 数据验证
**问题**：API 返回的数据格式不一致
**解决**：
- 添加数据验证逻辑
- 检查必填字段
- 实现默认值设置

### 示例：API 源 vs HTML 源

#### API 源（东方财富）
```typescript
// 使用 API 接口获取数据
const res: FastNewsResponse = await myFetch(apiUrl)
return res.data.fastNewsList.map((item) => {
  return {
    id: item.code,
    title: item.title,
    url: `https://kuaixun.eastmoney.com/news,${item.code}.html`,
    pubDate,
    extra: { hover: item.summary },
  }
})
```

#### HTML 源（示例）
```typescript
// 使用 HTML 解析获取数据
const response = await myFetch(url)
const $ = load(response)
const news: NewsItem[] = []

$(".news-item").each((_, el) => {
  const title = $(el).find(".title").text()
  const link = $(el).find("a").attr("href")
  
  if (title && link) {
    news.push({
      id: link,
      title: title.trim(),
      url: new URL(link, baseURL).toString(),
    })
  }
})

return news
```

### 总结
通过东方财富快讯源的实现案例，我们详细介绍了自定义新闻源的开发流程、技术要点和最佳实践。遵循这些规范，可以快速开发稳定、高效的新闻源，为 NewsNow 应用提供更丰富的内容来源。
### 部署与运行

#### 环境变量

**example.env.server**：
```env
# Github Client ID（用于登录）
G_CLIENT_ID=
# Github Client Secret（用于登录）
G_CLIENT_SECRET=
# JWT Secret，通常与 Client Secret 相同
JWT_SECRET=
# 初始化数据库，首次运行必须设置为 true
INIT_TABLE=true
# 是否启用缓存
ENABLE_CACHE=true
```

#### 部署方式

##### 2.1 Cloudflare Pages（推荐）
```sh
# 1. 安装依赖
pnpm install

# 2. 构建
pnpm run build

# 3. 部署
pnpm run deploy
```

##### 2.2 Docker 部署
```sh
docker compose up
```

##### 2.3 本地开发
```sh
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器
pnpm run dev
```

## 技术亮点与最佳实践

### 1. 架构设计
- **模块化**：每个新闻源独立为一个文件
- **类型安全**：全面使用 TypeScript，类型定义详细
- **前后端分离**：清晰的架构划分，便于维护和扩展

### 2. 性能优化
- **智能缓存策略**：动态调整抓取间隔
- **数据压缩**：使用 DB0 进行高效的数据存储
- **异步处理**：使用 `waitUntil` 处理后台任务

### 3. 用户体验
- **优雅界面**：响应式设计、深色模式、无干扰阅读体验
- **实时更新**：支持后台刷新和通知
- **个性化设置**：登录用户可定制源列表和同步设置

### 4. 代码质量
- **自动格式化**：使用 ESLint 和 Prettier 进行代码检查
- **测试覆盖**：使用 Vitest 进行单元测试
- **CI/CD**：GitHub Actions 自动化部署

## 新闻源支持

项目支持近 50 个主流新闻源，包括：
- 科技类：36kr、GitHub、Hacker News、V2EX
- 社交类：微博、知乎、豆瓣、小红书
- 视频类：Bilibili、抖音、YouTube
- 财经类：同花顺、雪球、金十数据
- 其他：百度、腾讯新闻、凤凰网等

## 核心特性

1. **实时新闻抓取**：根据源更新频率动态调整抓取间隔（最快 2 分钟）
2. **智能缓存**：默认 30 分钟缓存，登录用户可强制刷新

## 代理功能实现

### 1. 问题背景

项目在 Docker 容器中部署时，需要访问一些受限制的网站（如 Hacker News、ProductHunt 等），因此需要配置代理。最初在 Dockerfile 中设置了 `NODE_USE_ENV_PROXY=1` 和代理环境变量，但在 Node.js 20.12.2 版本中，`NODE_USE_ENV_PROXY` 环境变量并不支持 fetch 代理（该功能是在 Node.js 22.21.0 或 24.0.0+ 中才引入的），导致 Docker 容器中的代理不生效。

### 2. 解决方案

我们对 `server/utils/fetch.ts` 文件进行了修改，使用 `undici` 库的 `ProxyAgent` 或 `EnvHttpProxyAgent` 来实现代理功能。

#### 2.1 完整实现代码

```typescript
import process from "node:process"
import { $fetch } from "ofetch"

// 尝试从环境变量获取代理配置
const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || process.env.PROXY || process.env.proxy
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.PROXY || process.env.proxy

// 存储 dispatcher（延迟初始化）
let dispatcher: any = null

// 初始化 dispatcher（只执行一次）
let dispatcherInitialized = false
async function initDispatcher() {
  if (dispatcherInitialized) return
  dispatcherInitialized = true

  if (!httpProxy && !httpsProxy) return

  try {
    // 动态导入 undici
    const undici = await import("undici")

    // 优先尝试 EnvHttpProxyAgent（自动读取环境变量）
    if ("EnvHttpProxyAgent" in undici) {
      dispatcher = new undici.EnvHttpProxyAgent()
      console.log("[proxy] 使用 EnvHttpProxyAgent 配置代理")
    } else if ("ProxyAgent" in undici) {
      // 否则使用 ProxyAgent，优先使用 HTTPS_PROXY
      const proxyUrl = httpsProxy || httpProxy
      if (proxyUrl) {
        dispatcher = new undici.ProxyAgent(proxyUrl)
        console.log(`[proxy] 使用 ProxyAgent 配置代理: ${proxyUrl}`)
      }
    }
  } catch (e) {
    console.warn("[proxy] 无法加载 undici，代理配置可能不生效:", e)
  }
}

export const myFetch = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
  async onRequest({ options }) {
    // 在每次请求前确保 dispatcher 已初始化
    await initDispatcher()
    if (dispatcher) {
      options.dispatcher = dispatcher
    }
  },
})
```

### 3. 关键实现要点

#### 3.1 环境变量读取

支持多种环境变量格式（大写和小写）：
- `HTTP_PROXY` 或 `http_proxy`
- `HTTPS_PROXY` 或 `https_proxy`
- `PROXY` 或 `proxy`

#### 3.2 延迟初始化

- 代理 dispatcher 只在第一次请求时初始化
- 使用 `dispatcherInitialized` 标志确保只初始化一次
- 避免在不需要代理时加载 undici 库

#### 3.3 动态导入

使用 `await import("undici")` 动态导入 undici 库，避免在不需要代理的环境中加载不必要的依赖。

#### 3.4 优先使用 EnvHttpProxyAgent

优先使用 `undici.EnvHttpProxyAgent`，它会自动读取环境变量中的代理配置，简化配置。

如果 `EnvHttpProxyAgent` 不可用，则回退到 `undici.ProxyAgent`，手动配置代理 URL。

#### 3.5 与 ofetch 集成

在 `myFetch.create` 的 `onRequest` 钩子中，在每次请求前确保 dispatcher 已初始化，并将其配置到请求的 `options.dispatcher` 中。

### 4. Dockerfile 修改

为了保持镜像的纯净，删除了 Dockerfile 中硬编码的代理环境变量：

```dockerfile
# 删除了以下内容：
# ENV NODE_USE_ENV_PROXY=1
# ENV HTTP_PROXY=http://115.159.101.139:7890
# ENV HTTPS_PROXY=http://115.159.101.139:7890
# ENV PROXY=http://115.159.101.139:7890
```

现在代理完全通过运行时环境变量配置，镜像本身不包含任何代理信息。

### 5. docker-compose.yml 配置示例

在 docker-compose.yml 中配置代理环境变量：

```yaml
services:
  newsnow:
    image: your-image-name:latest
    ports:
      - "14444:4444"
    volumes:
      - newsnow_data:/usr/app/.data
    environment:
      - G_CLIENT_ID=
      - G_CLIENT_SECRET=
      - JWT_SECRET=
      - INIT_TABLE=true
      - ENABLE_CACHE=true
      - HTTP_PROXY=http://your-proxy-server:port
      - HTTPS_PROXY=http://your-proxy-server:port
      - PROXY=http://your-proxy-server:port

volumes:
  newsnow_data:
    name: newsnow_data
```

### 6. ESLint 修复

在修改 fetch.ts 时遇到了 ESLint 报错：`Unexpected use of the global variable 'process'. Use 'require("process")' instead`。解决方法是在文件顶部添加 `import process from "node:process"`。

### 7. 验证代理功能

启动 Docker 容器后，查看日志中是否有以下输出：
```
[proxy] 使用 EnvHttpProxyAgent 配置代理
```

然后尝试访问需要代理的新闻源（如 Hacker News、ProductHunt 等），验证功能是否正常。

### 8. 兼容性说明

- 该实现完全向后兼容，在没有配置代理的环境中不会影响现有功能
- 支持本地开发环境和 Docker 部署环境
- 不需要添加新的依赖，undici 已经是项目的依赖之一

### 9. 云服务器部署注意事项

#### 9.1 使用预构建的 Docker 镜像

镜像已上传到 Docker Hub，以后部署可以直接拉取：
```
kayparavel/newsnow-kayparavel:latest
```

这样就不需要在云服务器上重新构建项目了，只需要配置 docker-compose.yml 即可。

#### 9.2 端口映射问题

云服务器通常会禁止开放过于靠前的端口（如 80、443），建议使用较高的端口号。推荐的端口映射配置：
```yaml
ports:
  - "14444:4444"  # 使用 14444 端口映射到容器内的 4444 端口
```

#### 9.3 Docker Hub 访问限制（国内云服务商）

在国内云服务商部署时，可能会遇到 Docker Hub 访问限制问题：

**问题**：拉取 Docker Hub 镜像时速度很慢或失败

**解决方案**：
1. **给 Docker 配置代理**（推荐）：在 Docker 配置中设置代理，确保 Docker 能正常访问 Docker Hub
2. **镜像源可能不好用**：国内的 Docker 镜像源（如阿里云、腾讯云）可能不是最新的，或者更新不及时，建议优先使用代理

**Docker 代理配置方法**：
在 Linux 系统中，创建或编辑 `/etc/systemd/system/docker.service.d/http-proxy.conf` 文件：
```
[Service]
Environment="HTTP_PROXY=http://your-proxy-server:port"
Environment="HTTPS_PROXY=http://your-proxy-server:port"
Environment="NO_PROXY=localhost,127.0.0.1"
```

然后重启 Docker 服务：
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

#### 9.4 完整的云服务器 docker-compose.yml 示例

```yaml
services:
  newsnow:
    image: kayparavel/newsnow-kayparavel:latest  # 使用预构建的镜像
    container_name: newsnow
    ports:
      - "14444:4444"  # 使用较高的端口号
    volumes:
      - newsnow_data:/usr/app/.data
    environment:
      - G_CLIENT_ID=your_github_client_id
      - G_CLIENT_SECRET=your_github_client_secret
      - JWT_SECRET=your_jwt_secret
      - INIT_TABLE=true
      - ENABLE_CACHE=true
      - HTTP_PROXY=http://your-proxy-server:port
      - HTTPS_PROXY=http://your-proxy-server:port
      - PROXY=http://your-proxy-server:port
    restart: always

volumes:
  newsnow_data:
    name: newsnow_data
```

部署命令：
```bash
# 拉取镜像并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止容器
docker compose down
```

## 核心特性（续）

3. **个性化功能**：支持用户登录、数据同步、聚焦源管理
4. **优雅界面**：响应式设计，支持深色模式，无干扰阅读体验
5. **MCP 支持**：可作为 MCP 服务器集成到其他应用中
6. **PWA 支持**：可安装为桌面应用，支持离线缓存

### staggerRefresh 源刷新限制处理

#### 问题背景
某些新闻源（如界面新闻）会限制同一 IP 并发请求数，当多个板块同时刷新时会导致部分请求失败。

#### 解决方案

1. **在 `shared/types.ts 中添加 staggerRefresh 配置项
```typescript
export interface Source {
  name: string;
  interval: number;
  color: Color;
  // ...其他字段
  /**
   * 刷新时是否需要错开（避免并发请求被限制）
   */
  staggerRefresh?: boolean;
}
```

2. **在 `shared/pre-sources.ts` 中配置源
```typescript
"jiemian": {
  name: "界面新闻",
  type: "realtime",
  column: "china",
  home: "https://www.jiemian.com",
  color: "blue",
  sub: {
    quick: {
      title: "即时资讯",
      type: "realtime",
      interval: Time.Realtime,
      staggerRefresh: true, // 启用 staggerRefresh
    },
    todayhot: {
      title: "今日热点",
      type: "realtime",
      interval: Time.Realtime,
      staggerRefresh: true,
    },
    // ...其他子源同样配置 staggerRefresh: true
  },
}
```

3. **在 `src/hooks/useRefetch.ts` 中的处理逻辑
- 普通源并发刷新，`staggerRefresh` 源顺序刷新，每个间隔 1 秒
```typescript
const refresh = useCallback(async (...sourceIds: SourceID[]) => {
  if (enableLogin && !loggedIn) {
    // ...登录提示
  } else {
    // 分开需要错开的源和普通源
    const staggerSources: SourceID[] = [];
    const normalSources: SourceID[] = [];
    for (const id of sourceIds) {
      if (sources[id]?.staggerRefresh) {
        staggerSources.push(id);
      } else {
        normalSources.push(id);
      }
    }
    
    // 普通源并发刷新
    if (normalSources.length > 0) {
      refetchSources.clear();
      normalSources.forEach(id => refetchSources.add(id));
      await queryClient.refetchQueries({
        predicate: (query) => {
          const [type, id] = query.queryKey as ["source" | "entire", SourceID];
          return type === "source" && normalSources.includes(id);
        },
      });
    }
    
    // 需要错开的源顺序刷新，每个间隔 1 秒
    for (const id of staggerSources) {
      refetchSources.clear();
      refetchSources.add(id);
      await queryClient.refetchQueries({
        predicate: (query) => {
          const [type, queryId] = query.queryKey as ["source" | "entire", SourceID];
          return type === "source" && queryId === id;
        },
      });
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}, [loggedIn, toaster, login, enableLogin, queryClient]);
```

4. **重新生成 sources.json
```bash
pnpm run presource
```

## 部署方式

- **Cloudflare Pages**：推荐部署方式，自动构建和部署
- **Docker**：容器化部署，支持本地开发和生产环境
- **Vercel**：需自行配置数据库

## 技术亮点

1. **原子化设计**：使用 Jotai 实现精细的状态管理
2. **智能抓取策略**：根据源更新频率动态调整抓取间隔
3. **类型安全**：全面使用 TypeScript，类型定义详细
4. **高性能**：使用 React 19、Vite 等现代工具链
5. **可扩展性**：模块化架构，易于添加新的新闻源

