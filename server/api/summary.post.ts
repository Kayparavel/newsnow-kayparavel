import type { SourceID } from "@shared/types"
import type { LLMMessage } from "#/utils/llm"
import { chatCompletion } from "#/utils/llm"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { useProxyStorage } from "#/utils/fetch"

// 判断是否是译文源（通过 dependsOn 字段）
function isTranslatedSource(id: SourceID): boolean {
  return !!sources[id]?.dependsOn
}

interface SummaryRequest {
  summaryId?: string
  sources: SourceID[]
  prompt: string
  maxItemsPerSource?: number
  refreshInterval?: number // 分钟
}

// 内存缓存
const summaryCache = new Map<string, { data: any, expires: number }>()

interface NewsItemForLLM {
  title: string
  info?: string | false
  hover?: string
  url: string
}

function formatNewsForLLM(items: NewsItemForLLM[]): string {
  return items
    .filter(item => item.title)
    .map((item, i) => {
      let text = `${i + 1}. ${item.title}`
      if (item.info && item.info !== false) text += ` (${item.info})`
      if (item.hover) text += ` [${item.hover}]`
      if (item.url) text += ` 链接: ${item.url}`
      return text
    })
    .join("\n")
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { summaryId, sources: sourceIds, prompt, maxItemsPerSource = 30, refreshInterval = 30 } = body as SummaryRequest

  if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: "Missing sources",
    })
  }

  if (!prompt) {
    throw createError({
      statusCode: 400,
      message: "Missing prompt",
    })
  }

  // 检查缓存
  if (summaryId) {
    const cached = summaryCache.get(summaryId)
    if (cached && cached.expires > Date.now()) {
      logger.info(`[summary] returning cached result for ${summaryId}`)
      return cached.data
    }
  }

  logger.info(`[summary] request received, ${sourceIds.length} source(s)`)

  try {
    // 获取所有新闻源数据
    const allNewsItems: NewsItemForLLM[] = []
    const sourceNames: string[] = []

    const cacheTable = await getCacheTable()
    const now = Date.now()

    // 分离普通源和译文源，检查缓存是否过期
    const normalSourceIds: SourceID[] = []
    const translatedSourceIds: SourceID[] = []

    for (const sourceId of sourceIds) {
      if (!sources[sourceId] || !getters[sourceId]) {
        logger.warn(`[summary] invalid source: ${sourceId}`)
        continue
      }

      // 检查缓存是否过期
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

    // 第一轮：刷新普通源（带 stagger）
    for (const id of normalSourceIds) {
      try {
        const useProxy = cacheTable ? await cacheTable.getUseProxy(id) : false
        const data = await useProxyStorage.run(useProxy, async () => {
          return await getters[id]()
        })
        if (data?.length && cacheTable) {
          await cacheTable.updateAndSync(id, data.slice(0, 100))
          logger.success(`[summary] refreshed ${id}`)
        }
        // stagger: 错开 1 秒
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        logger.error(`[summary] failed to refresh ${id}:`, e)
      }
    }

    // 第二轮：刷新译文源（此时原文源缓存已是最新）
    for (const id of translatedSourceIds) {
      try {
        const useProxy = cacheTable ? await cacheTable.getUseProxy(id) : false
        const data = await useProxyStorage.run(useProxy, async () => {
          return await getters[id]()
        })
        if (data?.length && cacheTable) {
          await cacheTable.updateAndSync(id, data.slice(0, 100))
          logger.success(`[summary] refreshed ${id}`)
        }
        // stagger: 错开 1 秒
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        logger.error(`[summary] failed to refresh ${id}:`, e)
      }
    }

    // 从缓存获取所有源的数据
    for (const sourceId of sourceIds) {
      if (!sources[sourceId] || !getters[sourceId]) continue

      try {
        let items: any[] | undefined
        if (cacheTable) {
          const cache = await cacheTable.get(sourceId)
          if (cache) {
            items = cache.items
          }
        }

        // 缓存没有则直接获取
        if (!items) {
          items = await useProxyStorage.run(false, async () => {
            return await getters[sourceId]()
          })
        }

        if (items?.length) {
          const sourceName = sources[sourceId].name + (sources[sourceId].title ? `-${sources[sourceId].title}` : "")
          sourceNames.push(sourceName)
          allNewsItems.push(
            ...items.slice(0, maxItemsPerSource).map(item => ({
              title: item.title,
              info: item.extra?.info,
              hover: item.extra?.hover,
              url: item.url,
            })),
          )
        }
      } catch (e) {
        logger.error(`[summary] failed to fetch ${sourceId}:`, e)
      }
    }

    if (allNewsItems.length === 0) {
      throw new Error("No news items available")
    }

    logger.info(`[summary] collected ${allNewsItems.length} items from ${sourceNames.join(", ")}`)

    // 组装 LLM 请求
    const formatRequirement = `请以 JSON 格式返回汇总结果，格式如下,注意检查返回格式不要丢失字段或括号：
{
  "title": "汇总标题",
  "summary": "汇总正文内容，语言流畅自然，适合语音播报",
  "highlights": ["要点1", "要点2", "要点3"],
  "sources": ["来源1", "来源2"]
}
`

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `你是一个专业的新闻编辑，擅长将多条新闻汇总成简洁、有价值的摘要。${formatRequirement}`,
      },
      {
        role: "user",
        content: `${prompt}\n\n以下是新闻源数据（来源列表：${sourceNames.join("、")}）：\n\n新闻内容：\n${formatNewsForLLM(allNewsItems)}`,
      },
    ]

    // 调用 LLM
    logger.info(`[summary] calling LLM with ${allNewsItems.length} items...`)
    const content = await chatCompletion(messages, { maxTokens: 8192 })
    logger.info(`[summary] LLM response length: ${content.length} chars`)

    // 解析 JSON 响应
    let result
    try {
      // 尝试提取 JSON（可能被包裹在 markdown 代码块中）
      const jsonMatch = content.match(/```(?:json)?([\s\S]*?)```/) || [null, content]
      let jsonStr = jsonMatch[1].trim()
      // 修复常见问题：trailing comma、缺失的括号
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1")
      // 尝试补全缺失的括号
      const openBraces = (jsonStr.match(/\{/g) || []).length
      const closeBraces = (jsonStr.match(/\}/g) || []).length
      const openBrackets = (jsonStr.match(/\[/g) || []).length
      const closeBrackets = (jsonStr.match(/\]/g) || []).length
      if (openBrackets > closeBrackets) {
        jsonStr += "]".repeat(openBrackets - closeBrackets)
      }
      if (openBraces > closeBraces) {
        jsonStr += "}".repeat(openBraces - closeBraces)
      }
      result = JSON.parse(jsonStr)
    } catch (e) {
      logger.warn(`[summary] JSON parse failed, trying to extract manually:`, e)
      // 尝试手动提取字段
      try {
        const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/)
        const summaryMatch = content.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
        const highlightsMatch = content.match(/"highlights"\s*:\s*\[([\s\S]*?)(?:\]|$)/)
        result = {
          title: titleMatch?.[1] || "新闻汇总",
          summary: summaryMatch?.[1]?.replace(/\\n/g, "\n") || content,
          highlights: highlightsMatch
            ? highlightsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) || []
            : [],
          sources: sourceNames,
        }
      } catch {
        result = {
          title: "新闻汇总",
          summary: content,
          highlights: [],
          sources: sourceNames,
        }
      }
    }

    logger.success(`[summary] generated successfully`)

    const responseData = {
      success: true,
      ...result,
      sources: sourceNames, // 强制使用我们提供的来源列表，避免 LLM 幻觉
    }

    // 缓存结果
    if (summaryId) {
      summaryCache.set(summaryId, {
        data: responseData,
        expires: Date.now() + refreshInterval * 60 * 1000,
      })
      logger.info(`[summary] cached result for ${summaryId}, expires in ${refreshInterval} minutes`)
    }

    return responseData
  } catch (e: any) {
    logger.error(`[summary] failed:`, e.message)
    throw createError({
      statusCode: 500,
      message: `Summary failed: ${e.message}`,
    })
  }
})
