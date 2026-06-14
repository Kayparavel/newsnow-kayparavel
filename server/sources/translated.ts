import type { NewsItem, SourceID } from "@shared/types"
import { getCacheTable } from "#/database/cache"
import { isTranslateEnabled, translateNewsItems } from "#/utils/translate"
import { useProxyStorage } from "#/utils/fetch"

// 从译文源配置获取原文源 ID
function getOriginalSourceId(translatedId: SourceID): SourceID {
  const source = sources[translatedId]
  if (!source || !("dependsOn" in source) || !source.dependsOn) {
    throw new Error(`Invalid translated source ID: ${translatedId}, missing dependsOn field`)
  }
  return source.dependsOn as SourceID
}

// 给译文条目添加后缀，保持 ID 唯一性
function addTranslatedSuffix(item: NewsItem): NewsItem {
  return {
    ...item,
    id: `${item.id}-translated`,
  }
}

// 刷新原文源（只更新本地缓存，不同步 MySQL，同步由 cron 负责）
async function refreshOriginalSource(originalId: SourceID, cacheTable: any): Promise<NewsItem[]> {
  // 延迟导入 getters 避免循环依赖
  const { getters } = await import("#/getters")

  const useProxy = await cacheTable.getUseProxy(originalId)
  const data = await useProxyStorage.run(useProxy, async () => {
    return await getters[originalId]()
  })
  const items = data.slice(0, 100)
  if (items.length) {
    await cacheTable.set(originalId, items)
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

    // 检查原文源缓存是否需要刷新
    const originalSource = sources[originalId]
    const now = Date.now()
    const needRefresh = !originalCache || (originalSource && now - originalCache.updated >= originalSource.interval)

    if (needRefresh) {
      // 原文源无缓存或缓存已过期，刷新原文源
      logger.info(`[translated] ${originalId} cache ${!originalCache ? "not found" : "expired"}, refreshing...`)
      originalItems = await refreshOriginalSource(originalId, cacheTable)
    } else {
      // 原文源缓存有效，使用缓存数据
      logger.info(`[translated] Using original source cache for ${originalId}`)
      originalItems = originalCache.items
    }

    if (!originalItems.length) {
      logger.warn(`[translated] No items found for ${originalId}`)
      return []
    }

    // 读取译文源缓存
    const translatedCache = await cacheTable.get(translatedId)
    const existingTranslatedItems: NewsItem[] = translatedCache?.items ?? []

    // 建立译文 ID 到译文条目的映射（译文 ID = 原文 ID + "-translated"）
    const translatedMap = new Map<string, NewsItem>()
    for (const item of existingTranslatedItems) {
      translatedMap.set(String(item.id), item)
    }

    // 找出需要翻译的条目（原文有但译文没有的）
    const itemsToTranslate: NewsItem[] = []
    const translatedItems: NewsItem[] = []

    for (const originalItem of originalItems) {
      const translatedId = `${originalItem.id}-translated`
      const existingTranslation = translatedMap.get(translatedId)
      if (existingTranslation) {
        // 已有译文，直接使用
        translatedItems.push(existingTranslation)
      } else {
        // 没有译文，需要翻译
        itemsToTranslate.push(originalItem)
        // 先用原文占位，后面会替换为译文
        translatedItems.push(originalItem)
      }
    }

    if (itemsToTranslate.length > 0) {
      logger.info(`[translated] Translating ${itemsToTranslate.length} new items for ${translatedId} (skipping ${originalItems.length - itemsToTranslate.length} existing)`)

      // 翻译新增的条目
      const newTranslatedItems = await translateNewsItems(itemsToTranslate)

      // 给译文条目添加后缀
      const newTranslatedItemsWithSuffix = newTranslatedItems.map(addTranslatedSuffix)

      // 建立原文 ID 到译文的映射
      const newTranslatedMap = new Map<string, NewsItem>()
      for (let i = 0; i < itemsToTranslate.length; i++) {
        newTranslatedMap.set(String(itemsToTranslate[i].id), newTranslatedItemsWithSuffix[i])
      }

      // 替换占位的原文为译文
      for (let i = 0; i < translatedItems.length; i++) {
        const item = translatedItems[i]
        const newTranslation = newTranslatedMap.get(String(item.id))
        if (newTranslation) {
          translatedItems[i] = newTranslation
        }
      }

      logger.success(`[translated] ${translatedId} translation completed`)
    } else {
      logger.info(`[translated] No new items to translate for ${translatedId}`)
    }

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
