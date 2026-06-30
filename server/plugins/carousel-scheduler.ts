import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"
import type { NewsItem, SourceID } from "@shared/types"
import type { CarouselConfig, SummaryTTSResult } from "@shared/carousel"
import { sources } from "@shared/sources"
import { chatCompletion } from "#/utils/llm"
import { synthesizeSpeech } from "#/utils/tts"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { useProxyStorage } from "#/utils/fetch"

const summaryTTSCache = new Map<string, SummaryTTSResult>()
const schedulerTimers = new Map<string, NodeJS.Timeout>()

// 心跳机制：追踪前端活跃状态
const HEARTBEAT_TIMEOUT = 2 * 60 * 1000 // 2分钟无心跳则暂停任务
let lastHeartbeatTime = 0
let wasActive = false // 上次心跳状态

// 任务执行记录
let lastNewsRefreshTime = 0
const lastSummaryRefreshTime = new Map<string, number>()
let carouselConfig: CarouselConfig | null = null

export function updateHeartbeat() {
  const now = Date.now()

  // 检测是否从超时状态恢复
  // 条件：曾经有过心跳 且 已超时
  const isPreviouslyActive = lastHeartbeatTime > 0 && !isSchedulerActive()
  if (isPreviouslyActive) {
    wasActive = false
  }

  lastHeartbeatTime = now

  // 检测状态变化：从 inactive 变为 active
  if (!wasActive) {
    logger.info("[carousel-scheduler] heartbeat restored, checking if immediate execution needed")
    checkAndExecuteOnRestore(now)
  }
  wasActive = true
}

export function isSchedulerActive(): boolean {
  return lastHeartbeatTime > 0 && (Date.now() - lastHeartbeatTime) < HEARTBEAT_TIMEOUT
}

// 心跳恢复时检查是否需要立即执行
async function checkAndExecuteOnRestore(now: number) {
  if (!carouselConfig) return

  // 检查新闻源刷新
  const newsInterval = (carouselConfig.newsRefreshInterval || 10) * 60 * 1000
  if (lastNewsRefreshTime > 0 && (now - lastNewsRefreshTime) >= newsInterval) {
    logger.info("[carousel-scheduler] news refresh overdue, executing immediately")
    refreshAllNewsSources(carouselConfig)
  }

  // 检查汇总任务
  for (const summary of carouselConfig.summaries || []) {
    const interval = (summary.refreshInterval || 30) * 60 * 1000
    const lastTime = lastSummaryRefreshTime.get(summary.id) || 0
    if (lastTime > 0 && (now - lastTime) >= interval) {
      logger.info(`[carousel-scheduler] summary ${summary.name} overdue, executing immediately`)
      executeSummary(summary.id, carouselConfig)
    }
  }
}

const DATA_DIR = resolve(process.cwd(), ".data")
const CONFIG_PATH = join(DATA_DIR, "carousel.json")
const LEGACY_CONFIG_PATH = resolve(process.cwd(), "shared/carousel.json")

function loadCarouselConfig(): CarouselConfig | null {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, "utf-8")
      return JSON.parse(content) as CarouselConfig
    }
    if (existsSync(LEGACY_CONFIG_PATH)) {
      const content = readFileSync(LEGACY_CONFIG_PATH, "utf-8")
      const parsed = JSON.parse(content) as CarouselConfig
      try {
        mkdirSync(DATA_DIR, { recursive: true })
        writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), "utf-8")
        logger.info(`[carousel-scheduler] migrated config from legacy path to ${CONFIG_PATH}`)
      } catch {}
      return parsed
    }
    return null
  } catch (e) {
    logger.error("[carousel-scheduler] failed to load config:", e)
    return null
  }
}

// 执行汇总
async function executeSummaryLLM(summaryId: string, config: CarouselConfig): Promise<SummaryTTSResult["summary"]> {
  const summary = config.summaries.find(s => s.id === summaryId)
  if (!summary) return null

  const sourceIds = summary.sources
  const prompt = summary.prompt
  const maxItemsPerSource = 30

  // 获取新闻源数据
  const allNewsItems: { title: string, info?: string, hover?: string, url?: string }[] = []
  const sourceNames: string[] = []
  const cacheTable = await getCacheTable()
  const now = Date.now()

  // 需要刷新的源
  const sourceIdsToRefresh: SourceID[] = []

  for (const sourceId of sourceIds) {
    if (!sources[sourceId] || !getters[sourceId]) continue

    let needRefresh = true
    if (cacheTable) {
      const cache = await cacheTable.get(sourceId)
      if (cache && now - cache.updated < sources[sourceId].interval) {
        needRefresh = false
      }
    }

    if (needRefresh) {
      sourceIdsToRefresh.push(sourceId)
    }
  }

  // 刷新源数据
  for (const id of sourceIdsToRefresh) {
    try {
      const useProxy = cacheTable ? await cacheTable.getUseProxy(id) : false
      const data = await useProxyStorage.run(useProxy, async () => getters[id]())
      if (data?.length && cacheTable) {
        await cacheTable.updateAndSync(id, data.slice(0, 100))
      }
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      logger.error(`[carousel-scheduler] failed to refresh ${id}:`, e)
    }
  }

  // 从缓存获取数据
  for (const sourceId of sourceIds) {
    if (!sources[sourceId] || !getters[sourceId]) continue

    try {
      let items: NewsItem[] | undefined
      if (cacheTable) {
        const cache = await cacheTable.get(sourceId)
        if (cache) items = cache.items
      }

      if (!items) {
        items = await useProxyStorage.run(false, async () => getters[sourceId]())
      }

      if (items?.length) {
        const sourceName = sources[sourceId].name + (sources[sourceId].title ? `-${sources[sourceId].title}` : "")
        sourceNames.push(sourceName)
        allNewsItems.push(...items.slice(0, maxItemsPerSource).map(item => ({
          title: item.title,
          info: item.extra?.info,
          hover: item.extra?.hover,
          url: item.url,
        })))
      }
    } catch (e) {
      logger.error(`[carousel-scheduler] failed to fetch ${sourceId}:`, e)
    }
  }

  if (allNewsItems.length === 0) return null

  // 调用 LLM
  const formatRequirement = `请以 JSON 格式返回汇总结果，格式如下：
{
  "title": "汇总标题",
  "summary": "汇总正文内容，语言流畅自然，适合语音播报",
  "highlights": ["要点1", "要点2", "要点3"],
  "sources": ["来源1", "来源2"]
}

注意：汇总内容必须以给予的新闻素材为基础,不要杜撰,不要另行搜索.sources 字段必须严格使用上面列出的来源名称，不要编造或修改来源。`

  const messages = [
    {
      role: "system" as const,
      content: `你是一个专业的新闻编辑，擅长将多条新闻汇总成简洁、有价值的摘要。${formatRequirement}`,
    },
    {
      role: "user" as const,
      content: `${prompt}\n\n以下是新闻源数据（来源列表：${sourceNames.join("、")}）：\n\n新闻内容：\n${allNewsItems.map((item, i) => {
        let text = `${i + 1}. ${item.title}`
        if (item.info && item.info !== false) text += ` (${item.info})`
        if (item.hover) text += ` [${item.hover}]`
        if (item.url) text += ` 链接: ${item.url}`
        return text
      }).join("\n")}`,
    },
  ]

  const content = await chatCompletion(messages, { maxTokens: 8192, timeout: 120000 })

  // 解析 JSON
  try {
    const jsonMatch = content.match(/```(?:json)?([\s\S]*?)```/) || [null, content]
    let jsonStr = jsonMatch[1].trim()
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1")
    const openBrackets = (jsonStr.match(/\[/g) || []).length
    const closeBrackets = (jsonStr.match(/\]/g) || []).length
    if (openBrackets > closeBrackets) jsonStr += "]".repeat(openBrackets - closeBrackets)
    const openBraces = (jsonStr.match(/\{/g) || []).length
    const closeBraces = (jsonStr.match(/\}/g) || []).length
    if (openBraces > closeBraces) jsonStr += "}".repeat(openBraces - closeBraces)
    const result = JSON.parse(jsonStr)
    return { success: true, ...result, sources: sourceNames }
  } catch {
    return { success: true, title: "新闻汇总", summary: content, highlights: [], sources: sourceNames }
  }
}

// 执行汇总 + TTS
async function executeSummary(summaryId: string, config: CarouselConfig, isFirstRefresh: boolean = false): Promise<void> {
  // 首次执行无视心跳，后续执行需要心跳活跃
  if (!isFirstRefresh && !isSchedulerActive()) {
    logger.info("[carousel-scheduler] summary skipped: no active frontend")
    return
  }

  const summary = config.summaries.find(s => s.id === summaryId)
  if (!summary) return

  logger.info(`[carousel-scheduler] executing summary: ${summary.name}`)

  // 记录执行时间
  lastSummaryRefreshTime.set(summaryId, Date.now())

  try {
    // 1. 执行汇总
    const summaryResult = await executeSummaryLLM(summaryId, config)
    if (!summaryResult?.summary) {
      logger.warn(`[carousel-scheduler] no summary content for ${summaryId}`)
      return
    }

    // 2. 决定是否生成 TTS
    // 条件：全局 enableTTS 打开 且 节目单中有引用该汇总且 tts 为 true 的节目
    let audioBase64: string | null = null
    const shouldGenerateTTS = config.enableTTS && config.programs.some(
      p => p.type === "summary" && p.summaryId === summaryId && p.tts === true,
    )
    if (shouldGenerateTTS) {
      const audioBuffer = await synthesizeSpeech(summaryResult.summary)
      audioBase64 = audioBuffer.toString("base64")
      logger.info(`[carousel-scheduler] TTS generated for ${summary.name}`)
    }

    // 3. 缓存结果
    summaryTTSCache.set(summaryId, {
      summary: summaryResult,
      ttsAudio: audioBase64,
      expires: Date.now() + (summary.refreshInterval || 30) * 60 * 1000,
    })

    logger.success(`[carousel-scheduler] summary completed for ${summary.name}${shouldGenerateTTS ? " with TTS" : ""}`)
  } catch (e) {
    logger.error(`[carousel-scheduler] failed for ${summaryId}:`, e)
  }
}

// 启动定时任务
function startScheduler(summaryId: string, intervalMinutes: number, config: CarouselConfig): void {
  // 清除已有的定时任务
  if (schedulerTimers.has(summaryId)) {
    clearInterval(schedulerTimers.get(summaryId)!)
  }

  // 立即执行一次（首次执行无视心跳）
  executeSummary(summaryId, config, true)

  // 设置定时任务
  const timer = setInterval(() => {
    executeSummary(summaryId, config)
  }, intervalMinutes * 60 * 1000)

  schedulerTimers.set(summaryId, timer)
  logger.info(`[carousel-scheduler] started for ${summaryId}, interval: ${intervalMinutes} minutes`)
}

// 导出缓存查询函数
export function getSummaryTTSCache(summaryId: string): SummaryTTSResult | undefined {
  return summaryTTSCache.get(summaryId)
}

// 刷新单个新闻源
async function refreshNewsSource(sourceId: SourceID, isFirstRefresh: boolean = false): Promise<void> {
  // 首次执行无视心跳，后续执行需要心跳活跃
  if (!isFirstRefresh && !isSchedulerActive()) {
    logger.info(`[carousel-scheduler] refresh ${sourceId} skipped: no active frontend`)
    return
  }

  try {
    const cacheTable = await getCacheTable()
    if (!cacheTable) return

    // 检查是否需要刷新（如果缓存存在且未过期，跳过）
    const now = Date.now()
    const cache = await cacheTable.get(sourceId)
    const source = sources[sourceId]
    if (!isFirstRefresh && cache && source?.interval && now - cache.updated < source.interval) {
      return
    }

    const useProxy = await cacheTable.getUseProxy(sourceId)
    const data = await useProxyStorage.run(useProxy, async () => getters[sourceId]())
    if (data?.length) {
      const items = data.slice(0, 100)

      // 同步到 SQLite（updateAndSync 会计算 diff，首次刷新时跳过）
      await cacheTable.updateAndSync(sourceId, items, isFirstRefresh)

      // 根据 TTS 配置决定是否生成 TTS（首次刷新时跳过）
      const config = loadCarouselConfig()
      if (config?.enableTTS && !isFirstRefresh) {
        // 检查所有引用该新闻源的节目，对 tts 字段取或逻辑
        const shouldGenerateTTS = config.programs.some((p) => {
          if (p.type === "news" && p.sourceId === sourceId) return p.tts === true
          if (p.type === "collection" && p.collectionId) {
            const collection = config.collections.find(c => c.id === p.collectionId)
            if (collection?.sources.includes(sourceId)) return p.tts === true
          }
          return false
        })
        if (shouldGenerateTTS) {
          // 获取带 diff 的数据，找出新增项
          const cached = await cacheTable?.get(sourceId)
          if (cached?.items) {
            const newItems = cached.items.filter(item => item.extra?._isNew)
            if (newItems.length > 0) {
              const sourceName = sources[sourceId]?.name || sourceId
              try {
                const ttsData = await synthesizeSpeech(
                  `下面播报${sourceName}最新新闻。${
                    newItems.map(item => item.title).join("。")
                  }以上就是本时段${sourceName}最新新闻。`,
                )
                await cacheTable?.setTtsData(sourceId, ttsData.toString("base64"))
                logger.success(`[carousel-scheduler] TTS generated for ${sourceId}`)
              } catch (e) {
                logger.error(`[carousel-scheduler] TTS failed for ${sourceId}:`, e)
              }
            }
          }
        }
      }

      logger.success(`[carousel-scheduler] news source ${sourceId} refreshed`)
    }
  } catch (e) {
    logger.error(`[carousel-scheduler] failed to refresh news source ${sourceId}:`, e)
  }
}

// 刷新所有新闻源（按照原生刷新逻辑：先原文后译文，处理 stagger）
async function refreshAllNewsSources(config: CarouselConfig, isFirstRefresh: boolean = false): Promise<void> {
  // 首次执行无视心跳，后续执行需要心跳活跃
  if (!isFirstRefresh && !isSchedulerActive()) {
    logger.info("[carousel-scheduler] refresh all skipped: no active frontend")
    return
  }

  // 记录执行时间
  lastNewsRefreshTime = Date.now()

  const allSourceIds = new Set<SourceID>()

  // 收集所有节目中的新闻源
  for (const program of config.programs) {
    if (program.type === "news" && program.sourceId) {
      allSourceIds.add(program.sourceId)
    } else if (program.type === "collection" && program.collectionId) {
      const collection = config.collections.find(c => c.id === program.collectionId)
      if (collection) {
        collection.sources.forEach(id => allSourceIds.add(id))
      }
    }
  }

  // 分离译文源和原文源
  const translatedSources: SourceID[] = []
  const originalSources: SourceID[] = []
  for (const id of allSourceIds) {
    if (sources[id]?.dependsOn) {
      translatedSources.push(id)
    } else {
      originalSources.push(id)
    }
  }

  // 分离 stagger 源和普通源（原文源）
  const staggerSources: SourceID[] = []
  const normalSources: SourceID[] = []
  for (const id of originalSources) {
    if (sources[id]?.staggerRefresh) {
      staggerSources.push(id)
    } else {
      normalSources.push(id)
    }
  }

  logger.info(`[carousel-scheduler] refreshing ${originalSources.length} original source(s) and ${translatedSources.length} translated source(s)`)

  // 第一轮：刷新原文源
  // 普通源并发刷新
  if (normalSources.length > 0) {
    await Promise.all(normalSources.map(id => refreshNewsSource(id, isFirstRefresh)))
  }

  // stagger 源顺序刷新，每个间隔 1 秒
  for (const id of staggerSources) {
    await refreshNewsSource(id, isFirstRefresh)
    await new Promise(r => setTimeout(r, 1000))
  }

  // 第二轮：刷新译文源（此时原文源缓存已是最新）
  if (translatedSources.length > 0) {
    // 等待一小段时间确保原文源缓存已更新
    await new Promise(r => setTimeout(r, 500))
    await Promise.all(translatedSources.map(id => refreshNewsSource(id, isFirstRefresh)))
  }

  logger.success(`[carousel-scheduler] all news sources refreshed`)
}

export default defineNitroPlugin(async (_nitro) => {
  const config = loadCarouselConfig()
  if (!config) {
    logger.info("[carousel-scheduler] no config found")
    return
  }

  // 保存配置到全局变量，供心跳恢复时使用
  carouselConfig = config

  // 启动汇总定时任务
  if (config.summaries?.length) {
    logger.info(`[carousel-scheduler] starting ${config.summaries.length} summary scheduler(s)`)
    for (const summary of config.summaries) {
      if (summary.sources?.length && summary.prompt) {
        startScheduler(summary.id, summary.refreshInterval || 30, config)
      }
    }
  }

  // 启动新闻源定时任务
  const newsInterval = config.newsRefreshInterval || 10
  logger.info(`[carousel-scheduler] starting news source scheduler, interval: ${newsInterval} minutes`)

  // 立即执行一次（首次刷新不计算 diff，不生成 TTS）
  refreshAllNewsSources(config, true)

  // 设置定时任务
  setInterval(() => {
    refreshAllNewsSources(config)
  }, newsInterval * 60 * 1000)
})
