import process from "node:process"
import type { SourceID } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { useProxyStorage } from "#/utils/fetch"

// 译文源 ID 后缀
const TRANSLATED_SUFFIX = "-zh"

// 判断是否是译文源
function isTranslatedSource(id: SourceID): boolean {
  return id.endsWith(TRANSLATED_SUFFIX)
}

export default defineNitroPlugin(async (_nitro) => {
  const intervalMinutes = Number(process.env.CRON_INTERVAL) || 0
  if (intervalMinutes <= 0) return

  logger.info(`[auto-refresh] enabled, scan every ${intervalMinutes} minute(s)`)

  let running = false

  async function refreshAll() {
    if (running) {
      logger.warn("[auto-refresh] previous scan still running, skipping")
      return
    }
    running = true
    try {
      const cacheTable = await getCacheTable()
      if (!cacheTable) return

      const now = Date.now()
      const allIds = Object.keys(sources) as SourceID[]

      // 分离普通源和译文源
      const normalDueIds: SourceID[] = []
      const translatedDueIds: SourceID[] = []

      for (const id of allIds) {
        const source = sources[id]
        if (!source || !getters[id]) continue
        const cache = await cacheTable.get(id)
        if (!cache || now - cache.updated >= source.interval) {
          if (isTranslatedSource(id)) {
            translatedDueIds.push(id)
          } else {
            normalDueIds.push(id)
          }
        }
      }

      const totalDue = normalDueIds.length + translatedDueIds.length
      if (!totalDue) {
        logger.info("[auto-refresh] all caches are fresh, nothing to do")
        return
      }

      logger.info(`[auto-refresh] ${normalDueIds.length} normal source(s) and ${translatedDueIds.length} translated source(s) due for refresh`)

      // 第一轮：刷新普通源
      for (const id of normalDueIds) {
        await refreshOne(id, cacheTable)
        await new Promise(r => setTimeout(r, 1000))
      }

      // 第二轮：刷新译文源（此时原文源缓存已是最新）
      for (const id of translatedDueIds) {
        await refreshOne(id, cacheTable)
        await new Promise(r => setTimeout(r, 1000))
      }

      logger.success("[auto-refresh] scan complete")
    } catch (e) {
      logger.error("[auto-refresh] unexpected error:", e)
    } finally {
      running = false
    }
  }

  async function refreshOne(id: SourceID, cacheTable: NonNullable<Awaited<ReturnType<typeof getCacheTable>>>) {
    const useProxy = await cacheTable.getUseProxy(id)
    try {
      const data = await useProxyStorage.run(useProxy, async () => {
        return await getters[id]()
      })
      const items = data.slice(0, 100)
      if (items.length) {
        await cacheTable.updateAndSync(id, items)
        logger.success(`[auto-refresh] ${id} refreshed`)
      }
    } catch (e) {
      logger.error(`[auto-refresh] failed to refresh ${id}:`, e)
    }
  }

  setInterval(refreshAll, intervalMinutes * 60 * 1000)
  refreshAll()
})
