import type { colors } from "unocss/preset-mini"
import type { columns, fixedColumnIds } from "./metadata"
import type { originSources } from "./pre-sources"

export type Color = "primary" | Exclude<keyof typeof colors, "current" | "inherit" | "transparent" | "black" | "white">

type ConstSources = typeof originSources
type MainSourceID = keyof(ConstSources)

export type SourceID = {
  [Key in MainSourceID]: ConstSources[Key] extends { disable?: true } ? never :
    ConstSources[Key] extends { sub?: infer SubSource } ? {
    // @ts-expect-error >_<
      [SubKey in keyof SubSource]: SubSource[SubKey] extends { disable?: true } ? never : `${Key}-${SubKey}`
    }[keyof SubSource] | Key : Key;
}[MainSourceID]

export type AllSourceID = {
  [Key in MainSourceID]: ConstSources[Key] extends { sub?: infer SubSource } ? keyof {
    // @ts-expect-error >_<
    [SubKey in keyof SubSource as `${Key}-${SubKey}`]: never
  } | Key : Key
}[MainSourceID]

// export type DisabledSourceID = Exclude<SourceID, MainSourceID>

export type ColumnID = keyof typeof columns
export type Metadata = Record<ColumnID, Column>

export interface PrimitiveMetadata {
  updatedTime: number
  data: Record<FixedColumnID, SourceID[]>
  action: "init" | "manual" | "sync"
}

export type FixedColumnID = (typeof fixedColumnIds)[number]
export type HiddenColumnID = Exclude<ColumnID, FixedColumnID>

export interface OriginSource extends Partial<Omit<Source, "name" | "redirect">> {
  name: string
  sub?: Record<string, {
    /**
     * Subtitle 小标题
     */
    title: string
    // type?: "hottest" | "realtime"
    // desc?: string
    // column?: ManualColumnID
    // color?: Color
    // home?: string
    // disable?: boolean
    // interval?: number
  } & Partial<Omit<Source, "title" | "name" | "redirect">>>
}

export interface Source {
  name: string
  /**
   * 刷新的间隔时间
   */
  interval: number
  color: Color

  /**
   * Subtitle 小标题
   */
  title?: string
  desc?: string
  /**
   * Default normal timeline
   */
  type?: "hottest" | "realtime" | "polymarket"
  column?: HiddenColumnID
  home?: string
  /**
   * @default false
   */
  disable?: boolean | "cf"
  redirect?: SourceID
  /**
   * 刷新时是否需要错开（避免并发请求被限制）
   */
  staggerRefresh?: boolean
}

export interface Column {
  name: string
  sources: SourceID[]
}

export interface NewsItem {
  id: string | number // unique
  title: string
  url: string
  mobileUrl?: string // 移动端专用链接，移动端优先使用
  pubDate?: number | string // 发布时间，时间戳或字符串，优先使用
  extra?: {
    hover?: string // 鼠标悬停时显示的内容
    date?: number | string // 备用发布时间，时间戳或字符串（旧字段）
    info?: false | string // 显示在标题下方的额外信息，设为 false 时不显示
    diff?: number // 位置变化，显示为 +1、-2 等
    icon?: false | string | { // 自定义小图标，设为 false 时不显示
      url: string
      scale: number
    }
  } & {
    polymarket?: { // 仅 Polymarket 源使用的特殊字段
      eventSlug: string // 事件唯一标识符，用于拼接跳转 URL
      imageUrl?: string // 事件图片 URL
      icon?: string // 事件图标
      endDate?: string // 事件结束日期
      active?: boolean // 事件是否活跃
      description?: string // 事件描述
      volume24hr?: string // 24小时交易量
      markets: Array<{ // 事件下的市场列表，每个市场是事件加上限定条件
        slug: string // 市场唯一标识符
        question: string // 市场问题
        tokenName?: string // 暂无使用
        outcomePrices: string[] // Yes/No 结果价格，0-1 数值，乘以 100 显示百分比
        outcomes?: string[] // 结果选项，一般是 ["Yes", "No"]
        volume24h?: string // 24 小时交易量
        imageUrl?: string // 市场图片 URL
        active?: boolean // 市场是否活跃
        description?: string // 市场描述
        url?: string // 市场链接
      }>
    }
  }
}

export interface SourceResponse {
  status: "success" | "cache"
  id: SourceID
  updatedTime: number | string
  items: NewsItem[]
}
