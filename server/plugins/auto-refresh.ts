import process from "node:process"
import type { SourceID } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { useProxyStorage } from "#/utils/fetch"

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
      const dueIds: SourceID[] = []

      for (const id of allIds) {
        const source = sources[id]
        if (!source || !getters[id]) continue
        const cache = await cacheTable.get(id)
        if (!cache || now - cache.updated >= source.interval) {
          dueIds.push(id)
        }
      }

      if (!dueIds.length) {
        logger.info("[auto-refresh] all caches are fresh, nothing to do")
        return
      }

      logger.info(`[auto-refresh] ${dueIds.length} source(s) due for refresh`)

      for (const id of dueIds) {
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
