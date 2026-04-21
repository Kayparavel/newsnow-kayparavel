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

#### 1.2 源配置文件 (shared/sources.json)
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

### 7. 数据库支持

#### 7.1 支持的数据库
- **SQLite**：本地开发和 Docker 部署
- **Cloudflare D1**：推荐的生产部署方案
- **其他**：通过 DB0 支持多种数据库（PostgreSQL、MySQL、MongoDB 等）

#### 7.2 数据库配置

**Cloudflare D1 配置 (wrangler.toml)**：
```toml
name = "newsnow"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "newsnow-db"
database_id = "your-database-id"
```

### 8. 抓取策略优化

#### 8.1 动态刷新间隔
- 每个新闻源可配置不同的刷新间隔（interval 属性）
- 热门源（如微博）刷新间隔短（2分钟）
- 冷门源刷新间隔长（10分钟或更久）
- 服务器会根据源的更新频率自动调整

#### 8.2 缓存机制
- **TTL 缓存**：默认 30 分钟，在时间范围内即使内容更新也返回缓存
- **强制刷新**：登录用户可通过 `?latest=true` 参数强制获取最新数据
- **智能缓存**：在刷新间隔内返回缓存，超过间隔才重新抓取

#### 8.3 防封禁策略
- 统一的 User-Agent 头部
- 可配置的请求间隔
- 错误重试机制
- 代理支持（通过 environment variables 配置）

### 9. 扩展与维护

#### 9.1 添加新的新闻源
1. 在 `server/sources/` 目录下创建新的解析器文件
2. 使用 `defineSource` 函数定义源抓取函数
3. 在 `shared/sources.json` 中添加源配置
4. 可选：在 `public/icons/` 目录下添加源图标

#### 9.2 源解析器开发模板

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

### 常见问题与解决方案

#### 1. 编码问题
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
3. **个性化功能**：支持用户登录、数据同步、聚焦源管理
4. **优雅界面**：响应式设计，支持深色模式，无干扰阅读体验
5. **MCP 支持**：可作为 MCP 服务器集成到其他应用中
6. **PWA 支持**：可安装为桌面应用，支持离线缓存

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
