import process from "node:process"
import mysql from "mysql2/promise"
import type { NewsItem } from "@shared/types"

interface NewsRow {
  id: string
  updated: number
  data: string
}

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS news_items (
  id VARCHAR(128) PRIMARY KEY,
  updated BIGINT NOT NULL,
  data LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

class MySQLNewsStore {
  private pool: mysql.Pool
  private database: string

  constructor(pool: mysql.Pool, database: string) {
    this.pool = pool
    this.database = database
  }

  static async create(config: mysql.PoolOptions, database: string): Promise<MySQLNewsStore | undefined> {
    try {
      const adminPool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 })
      await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`)
      await adminPool.end()

      const poolOptions: mysql.PoolOptions = {
        ...config,
        database,
        waitForConnections: true,
        connectionLimit: 5,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
      }
      const pool = mysql.createPool(poolOptions)
      const conn = await pool.getConnection()
      conn.release()
      await pool.query(TABLE_SQL)
      logger.success(`[mysql:${database}] connected and table ready`)
      return new MySQLNewsStore(pool, database)
    } catch (e) {
      logger.error(`[mysql:${database}] init failed:`, e)
      return undefined
    }
  }

  async get(sourceId: string): Promise<NewsItem[] | undefined> {
    const [rows] = await this.pool.query("SELECT data FROM news_items WHERE id = ?", [sourceId]) as [NewsRow[], any]
    if (rows.length) {
      return JSON.parse(rows[0].data) as NewsItem[]
    }
  }

  async set(sourceId: string, items: NewsItem[]): Promise<void> {
    const now = Date.now()
    const data = JSON.stringify(items)
    await this.pool.query(
      "REPLACE INTO news_items (id, updated, data) VALUES (?, ?, ?)",
      [sourceId, now, data],
    )
  }

  async appendItems(sourceId: string, newItems: NewsItem[]): Promise<void> {
    const now = Date.now()
    const existing = await this.get(sourceId)
    if (existing) {
      const existingIds = new Set(existing.map(i => String(i.id)))
      const merged = [...existing, ...newItems.filter(i => !existingIds.has(String(i.id)))]
      const data = JSON.stringify(merged)
      await this.pool.query(
        "UPDATE news_items SET data = ?, updated = ? WHERE id = ?",
        [data, now, sourceId],
      )
    } else {
      const data = JSON.stringify(newItems)
      await this.pool.query(
        "INSERT INTO news_items (id, updated, data) VALUES (?, ?, ?)",
        [sourceId, now, data],
      )
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

let newsoldStore: MySQLNewsStore | undefined
let newsnowStore: MySQLNewsStore | undefined
let initialized = false

async function initMySQLStores() {
  if (initialized) return
  initialized = true

  const host = process.env.MYSQL_HOST
  const port = Number(process.env.MYSQL_PORT)
  const user = process.env.MYSQL_USER
  const password = process.env.MYSQL_PASSWORD
  const newsoldDb = process.env.MYSQL_NEWSOLD_DB || "newsold"
  const newsnowDb = process.env.MYSQL_NEWSNOW_DB || "newsnow"

  if (!host || !port || !user || !password) {
    logger.info("[mysql] config missing, skipping MySQL init")
    return
  }

  const baseConfig: mysql.PoolOptions = { host, port, user, password, charset: "utf8mb4" }
  newsoldStore = await MySQLNewsStore.create(baseConfig, newsoldDb)
  newsnowStore = await MySQLNewsStore.create(baseConfig, newsnowDb)
}

export async function getNewsoldStore() {
  await initMySQLStores()
  return newsoldStore
}

export async function getNewsnowStore() {
  await initMySQLStores()
  return newsnowStore
}

export async function syncNewsItems(sourceId: string, oldItems: NewsItem[], newItems: NewsItem[]) {
  const oldIds = new Set(oldItems.map(i => String(i.id)))
  const diffItems = newItems.filter(i => !oldIds.has(String(i.id)))

  if (!diffItems.length) return

  logger.info(`[mysql] ${sourceId}: ${diffItems.length} new items`)

  const newsold = await getNewsoldStore()
  const newsnow = await getNewsnowStore()

  if (newsold) {
    try {
      await newsold.appendItems(sourceId, diffItems)
      logger.success(`[mysql:newsold] ${sourceId} appended ${diffItems.length} items`)
    } catch (e) {
      logger.error(`[mysql:newsold] append ${sourceId} failed:`, e)
    }
  }

  if (newsnow) {
    try {
      await newsnow.set(sourceId, diffItems)
      logger.success(`[mysql:newsnow] ${sourceId} set ${diffItems.length} items`)
    } catch (e) {
      logger.error(`[mysql:newsnow] set ${sourceId} failed:`, e)
    }
  }
}
