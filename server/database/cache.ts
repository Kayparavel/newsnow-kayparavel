import process from "node:process"
import type { NewsItem } from "@shared/types"
import type { Database } from "db0"
import { sources } from "@shared/sources"
import type { CacheInfo, CacheRow } from "../types"
import { syncNewsItems } from "./mysql"

export class Cache {
  private db
  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS cache (
        id TEXT PRIMARY KEY,
        updated INTEGER,
        data TEXT,
        useProxy INTEGER DEFAULT 0,
        ttsData TEXT
      );
    `).run()
    // 添加 ttsData 列（如果不存在）
    try {
      await this.db.prepare(`ALTER TABLE cache ADD COLUMN ttsData TEXT`).run()
    } catch {}
    logger.success(`init cache table`)
  }

  async set(id: string, value: NewsItem[]) {
    const now = Date.now()
    // 先查询是否存在
    const exists = await this.db.prepare(`SELECT id FROM cache WHERE id = ?`).get(id)

    if (exists) {
      // 存在，更新，保留 useProxy
      await this.db.prepare(
        `UPDATE cache SET data = ?, updated = ? WHERE id = ?`,
      ).run(JSON.stringify(value), now, id)
    } else {
      // 不存在，插入新行，useProxy 默认为 0
      await this.db.prepare(
        `INSERT INTO cache (id, data, updated, useProxy) VALUES (?, ?, ?, 0)`,
      ).run(id, JSON.stringify(value), now)
    }
    logger.success(`set ${id} cache`)
  }

  async updateAndSync(id: string, value: NewsItem[], skipDiff: boolean = false) {
    const oldCache = await this.get(id)
    const oldItems = oldCache?.items ?? []

    // 计算 diff（首次刷新时跳过）
    let diffItems: NewsItem[]
    if (skipDiff || oldItems.length === 0) {
      // 首次刷新：热门类设置 diff: 0，实时类设置 _isNew: false
      const sourceType = (sources as any)[id]?.type
      if (sourceType === "hottest") {
        diffItems = value.map(item => ({
          ...item,
          extra: { ...item.extra, diff: 0 }
        }))
      } else {
        diffItems = value.map(item => ({
          ...item,
          extra: { ...item.extra, _isNew: false }
        }))
      }
    } else {
      const sourceType = (sources as any)[id]?.type
      if (sourceType === "hottest") {
        // 热门类：计算排名变化
        diffItems = value.map((item, i) => {
          const oldIndex = oldItems.findIndex(k => String(k.id) === String(item.id))
          const diff = oldIndex === -1 ? undefined : oldIndex - i
          return { ...item, extra: { ...item.extra, diff } }
        })
      } else {
        // 实时类：标记新增项
        const oldIds = new Set(oldItems.map(item => String(item.id)))
        diffItems = value.map(item => ({
          ...item,
          extra: { ...item.extra, _isNew: !oldIds.has(String(item.id)) }
        }))
      }
    }

    // 存入带 diff 的数据
    await this.set(id, diffItems)
    await syncNewsItems(id, oldItems, value)
  }

  async get(id: string): Promise<CacheInfo | undefined> {
    const row = (await this.db.prepare(`SELECT id, data, updated FROM cache WHERE id = ?`).get(id)) as CacheRow | undefined
    if (row) {
      logger.success(`get ${id} cache`)
      return {
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data),
      }
    }
  }

  async getEntire(keys: string[]): Promise<CacheInfo[]> {
    const keysStr = keys.map(k => `id = '${k}'`).join(" or ")
    const res = await this.db.prepare(`SELECT id, data, updated FROM cache WHERE ${keysStr}`).all() as any
    const rows = (res.results ?? res) as CacheRow[]

    /**
     * https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#return-object
     * cloudflare d1 .all() will return
     * {
     *   success: boolean
     *   meta:
     *   results:
     * }
     */
    if (rows?.length) {
      logger.success(`get entire (...) cache`)
      return rows.map(row => ({
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data) as NewsItem[],
      }))
    } else {
      return []
    }
  }

  async getUseProxy(id: string): Promise<boolean> {
    const row = (await this.db.prepare(`SELECT useProxy FROM cache WHERE id = ?`).get(id)) as { useProxy: number } | undefined
    // 如果没有记录或者 useProxy 为 NULL，默认返回 false
    return !!(row && row.useProxy === 1)
  }

  async setUseProxy(id: string, useProxy: boolean) {
    // 先查询是否存在
    const exists = await this.db.prepare(`SELECT id FROM cache WHERE id = ?`).get(id)

    if (exists) {
      // 存在，更新
      await this.db.prepare(
        `UPDATE cache SET useProxy = ? WHERE id = ?`,
      ).run(useProxy ? 1 : 0, id)
    } else {
      // 不存在，插入新行
      await this.db.prepare(
        `INSERT INTO cache (id, useProxy) VALUES (?, ?)`,
      ).run(id, useProxy ? 1 : 0)
    }
    logger.success(`set ${id} useProxy: ${useProxy}`)
  }

  async getAllUseProxy(): Promise<Partial<Record<string, boolean>>> {
    const res = await this.db.prepare(`SELECT id, useProxy FROM cache WHERE useProxy IS NOT NULL`).all() as any
    const rows = (res.results ?? res) as { id: string, useProxy: number }[]
    const result: Partial<Record<string, boolean>> = {}
    rows.forEach((row) => {
      result[row.id] = row.useProxy === 1
    })
    return result
  }

  async delete(id: string) {
    return await this.db.prepare(`DELETE FROM cache WHERE id = ?`).run(id)
  }

  async getTtsData(id: string): Promise<string | null> {
    const row = (await this.db.prepare(`SELECT ttsData FROM cache WHERE id = ?`).get(id)) as { ttsData: string | null } | undefined
    return row?.ttsData ?? null
  }

  async setTtsData(id: string, ttsData: string | null) {
    const exists = await this.db.prepare(`SELECT id FROM cache WHERE id = ?`).get(id)
    if (exists) {
      await this.db.prepare(`UPDATE cache SET ttsData = ? WHERE id = ?`).run(ttsData, id)
    } else {
      await this.db.prepare(`INSERT INTO cache (id, ttsData) VALUES (?, ?)`).run(id, ttsData)
    }
  }
}

export async function getCacheTable() {
  try {
    const db = useDatabase()
    // logger.info("db: ", db.getInstance())
    if (process.env.ENABLE_CACHE === "false") return
    const cacheTable = new Cache(db)
    if (process.env.INIT_TABLE !== "false") await cacheTable.init()
    return cacheTable
  } catch (e) {
    logger.error("failed to init database ", e)
  }
}
