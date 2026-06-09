import type { NewsItem, SourceID } from "@shared/types"
import { getCacheTable } from "#/database/cache"
import { isTranslateEnabled, translateNewsItems } from "#/utils/translate"
import { useProxyStorage } from "#/utils/fetch"

// 译文源 ID 后缀
const TRANSLATED_SUFFIX = "-zh"

// 从译文源 ID 推导出原文源 ID
function getOriginalSourceId(translatedId: SourceID): SourceID {
  if (!translatedId.endsWith(TRANSLATED_SUFFIX)) {
    throw new Error(`Invalid translated source ID: ${translatedId}`)
  }
  return translatedId.slice(0, -TRANSLATED_SUFFIX.length) as SourceID
}

// 刷新原文源
async function refreshOriginalSource(originalId: SourceID, cacheTable: any): Promise<NewsItem[]> {
  // 延迟导入 getters 避免循环依赖
  const { getters } = await import("#/getters")

  const useProxy = await cacheTable.getUseProxy(originalId)
  const data = await useProxyStorage.run(useProxy, async () => {
    return await getters[originalId]()
  })
  const items = data.slice(0, 100)
  if (items.length) {
    await cacheTable.updateAndSync(originalId, items)
    logger.success(`[translated] refreshed original source: ${originalId}`)
  }
  return items
}

// 创建译文源 getter
function createTranslatedGetter(translatedId: SourceID) {
  return async (): Promise<NewsItem[]> => {
    logger.info(`[translated] Processing ${translatedId}`)

    if (!isTranslateEnabled()) {
      logger.error("[translated] Translation is not enabled")
      throw new Error("Translation is not enabled. Please set TENCENT_SECRET_ID and TENCENT_SECRET_KEY environment variables.")
    }

    const originalId = getOriginalSourceId(translatedId)
    const cacheTable = await getCacheTable()

    if (!cacheTable) {
      throw new Error("Cache table is not available")
    }

    // 读取原文源缓存
    let originalItems: NewsItem[] = []
    const originalCache = await cacheTable.get(originalId)

    if (originalCache) {
      // 原文源有缓存，使用原文源的缓存数据
      logger.info(`[translated] Using original source cache for ${originalId}`)
      originalItems = originalCache.items
    } else {
      // 原文源也没有缓存，刷新原文源
      logger.info(`[translated] No cache for ${originalId}, refreshing...`)
      originalItems = await refreshOriginalSource(originalId, cacheTable)
    }

    if (!originalItems.length) {
      logger.warn(`[translated] No items found for ${originalId}`)
      return []
    }

    // 翻译
    logger.info(`[translated] Translating ${originalItems.length} items for ${translatedId}`)
    const translatedItems = await translateNewsItems(originalItems)

    logger.success(`[translated] ${translatedId} translation completed`)

    return translatedItems
  }
}

// 获取所有译文源配置
function getTranslatedSources(): Record<SourceID, () => Promise<NewsItem[]>> {
  const result: Record<string, () => Promise<NewsItem[]>> = {}

  // 遍历所有源配置，找到有 dependsOn 字段的源
  for (const [id, source] of Object.entries(sources)) {
    if (source && "dependsOn" in source && source.dependsOn) {
      result[id] = createTranslatedGetter(id as SourceID)
    }
  }

  return result as Record<SourceID, () => Promise<NewsItem[]>>
}

// 导出所有译文源 getter
export default defineSource(getTranslatedSources())
