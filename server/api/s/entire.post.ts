import type { SourceID, SourceResponse } from "@shared/types"
import { getCacheTable } from "#/database/cache"

export default defineEventHandler(async (event) => {
  try {
    const { sources: _ }: { sources: SourceID[] } = await readBody(event)
    const cacheTable = await getCacheTable()
    const ids = _?.filter(k => sources[k])
    if (ids?.length && cacheTable) {
      const caches = await cacheTable.getEntire(ids)
      // const now = Date.now()  // 不再需要，修复updatedTime后统一使用cache.updated
      return caches.map(cache => ({
        status: "cache",
        id: cache.id,
        items: cache.items,
        // updatedTime: now - cache.updated < sources[cache.id].interval ? now : cache.updated,  // 原代码：interval内返回now，导致前端显示"刚刚更新"，但实际并未重新抓取数据
        updatedTime: cache.updated, // 修复：始终返回缓存的真实更新时间，避免虚假的"刚刚更新"
      })) as SourceResponse[]
    }
  } catch {
    //
  }
})
