import type { SourceID } from "./types"

// 节目类型
export type ProgramType = "news" | "summary" | "break" | "collection"

// 汇总配置
export interface Summary {
  id: string
  name: string
  sources: SourceID[]
  prompt: string
  refreshInterval: number // 刷新间隔（分钟）
}

// 集合配置
export interface Collection {
  id: string
  name: string
  sources: SourceID[]
}

// 节目单项目
export interface Program {
  type: ProgramType
  sourceId?: SourceID
  summaryId?: string
  collectionId?: string
  duration: number
  label?: string
  tts?: boolean
  columns?: number // 1-3 列
}

// 轮播配置
export interface CarouselConfig {
  channelName: string
  summaries: Summary[]
  collections: Collection[]
  programs: Program[]
  enableTTS: boolean
  newsRefreshInterval: number // 新闻源刷新间隔（分钟）
}

// 汇总 + TTS 结果缓存
export interface SummaryTTSResult {
  summary: {
    success: boolean
    title: string
    summary: string
    highlights: string[]
    sources: string[]
  } | null
  ttsAudio: string | null // base64
  expires: number
}
