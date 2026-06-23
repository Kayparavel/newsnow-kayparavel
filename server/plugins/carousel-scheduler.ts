import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import type { SourceID } from "@shared/types"
import { chatCompletion } from "#/utils/llm"
import { synthesizeSpeech } from "#/utils/tts"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { useProxyStorage } from "#/utils/fetch"

// 汇总 + TTS 结果缓存
interface SummaryTTSResult {
  summary: any
  ttsAudio: string | null // base64
  expires: number
}

const summaryTTSCache = new Map<string, SummaryTTSResult>()
const schedulerTimers = new Map<string, NodeJS.Timeout>()

// 获取项目根目录
function getProjectRoot(): string {
  return process.cwd()
}

// 加载轮播配置
function loadCarouselConfig(): any {
  try {
    const configPath = join(getProjectRoot(), "shared/carousel.json")
    if (!existsSync(configPath)) return null
    const content = readFileSync(configPath, "utf-8")
    return JSON.parse(content)
  } catch (e) {
    logger.error("[carousel-scheduler] failed to load config:", e)
    return null
  }
}

// 判断是否是译文源
function isTranslatedSource(id: SourceID): boolean {
  return !!sources[id]?.dependsOn
}

// 执行汇总
async function executeSummaryLLM(summaryId: string, config: any): Promise<any> {
  const summary = config.summaries.find((s: any) => s.id === summaryId)
  if (!summary) return null

  const sourceIds = summary.sources as SourceID[]
  const prompt = summary.prompt
  const maxItemsPerSource = 30

  // 获取新闻源数据
  const allNewsItems: any[] = []
  const sourceNames: string[] = []
  const cacheTable = await getCacheTable()
  const now = Date.now()

  // 分离普通源和译文源
  const normalSourceIds: SourceID[] = []
  const translatedSourceIds: SourceID[] = []

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
      if (isTranslatedSource(sourceId)) {
        translatedSourceIds.push(sourceId)
      } else {
        normalSourceIds.push(sourceId)
      }
    }
  }

  // 刷新普通源
  for (const id of normalSourceIds) {
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

  // 刷新译文源
  for (const id of translatedSourceIds) {
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
      let items: any[] | undefined
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

  const content = await chatCompletion(messages, { maxTokens: 8192 })

  // 解析 JSON
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content]
    let jsonStr = jsonMatch[1].trim()
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1")
    const openBrackets = (jsonStr.match(/\[/g) || []).length
    const closeBrackets = (jsonStr.match(/]/g) || []).length
    if (openBrackets > closeBrackets) jsonStr += "]".repeat(openBrackets - closeBrackets)
    const openBraces = (jsonStr.match(/{/g) || []).length
    const closeBraces = (jsonStr.match(/}/g) || []).length
    if (openBraces > closeBraces) jsonStr += "}".repeat(openBraces - closeBraces)
    const result = JSON.parse(jsonStr)
    return { success: true, ...result, sources: sourceNames }
  } catch {
    return { success: true, title: "新闻汇总", summary: content, highlights: [], sources: sourceNames }
  }
}

// 执行汇总 + TTS
async function executeSummary(summaryId: string, config: any): Promise<void> {
  const summary = config.summaries.find((s: any) => s.id === summaryId)
  if (!summary) return

  logger.info(`[carousel-scheduler] executing summary: ${summary.name}`)

  try {
    // 1. 执行汇总
    const summaryResult = await executeSummaryLLM(summaryId, config)
    if (!summaryResult?.summary) {
      logger.warn(`[carousel-scheduler] no summary content for ${summaryId}`)
      return
    }

    // 2. 根据 tts 字段决定是否生成 TTS
    let audioBase64: string | null = null
    if (summary.tts) {
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

    logger.success(`[carousel-scheduler] summary completed for ${summary.name}${summary.tts ? " with TTS" : ""}`)
  } catch (e) {
    logger.error(`[carousel-scheduler] failed for ${summaryId}:`, e)
  }
}

// 启动定时任务
function startScheduler(summaryId: string, intervalMinutes: number, config: any): void {
  // 清除已有的定时任务
  if (schedulerTimers.has(summaryId)) {
    clearInterval(schedulerTimers.get(summaryId)!)
  }

  // 立即执行一次
  executeSummary(summaryId, config)

  // 设置定时任务
  const timer = setInterval(() => {
    executeSummary(summaryId, config)
  }, intervalMinutes * 60 * 1000)

  schedulerTimers.set(summaryId, timer)
  logger.info(`[carousel-scheduler] started for ${summaryId}, interval: ${intervalMinutes} minutes`)
}

// 停止所有定时任务
function stopAllSchedulers(): void {
  for (const [id, timer] of schedulerTimers) {
    clearInterval(timer)
    logger.info(`[carousel-scheduler] stopped for ${id}`)
  }
  schedulerTimers.clear()
}

// 导出缓存查询函数
export function getSummaryTTSCache(summaryId: string): SummaryTTSResult | undefined {
  return summaryTTSCache.get(summaryId)
}

export default defineNitroPlugin(async (_nitro) => {
  const config = loadCarouselConfig()
  if (!config?.summaries?.length) {
    logger.info("[carousel-scheduler] no summaries configured")
    return
  }

  logger.info(`[carousel-scheduler] starting ${config.summaries.length} summary scheduler(s)`)

  // 为每个汇总项启动定时任务
  for (const summary of config.summaries) {
    if (summary.sources?.length && summary.prompt) {
      startScheduler(summary.id, summary.refreshInterval || 30, config)
    }
  }

  // 监听配置变化（可选：定期重新加载配置）
  // setInterval(() => {
  //   const newConfig = loadCarouselConfig()
  //   // 检查配置是否有变化...
  // }, 60000)
})
