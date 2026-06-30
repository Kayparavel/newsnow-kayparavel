import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

const DATA_DIR = resolve(process.cwd(), ".data")
const CONFIG_PATH = join(DATA_DIR, "carousel.json")
const LEGACY_PATHS = [
  resolve(process.cwd(), "shared/carousel.json"),
]

const defaultConfig = {
  channelName: "NewsNow 频道",
  summaries: [],
  collections: [],
  programs: [],
  enableTTS: true,
  newsRefreshInterval: 10,
}

function normalizeConfig(raw: any) {
  return {
    channelName: raw.channelName || defaultConfig.channelName,
    summaries: Array.isArray(raw.summaries) ? raw.summaries : defaultConfig.summaries,
    collections: Array.isArray(raw.collections) ? raw.collections : defaultConfig.collections,
    programs: Array.isArray(raw.programs) ? raw.programs : defaultConfig.programs,
    enableTTS: raw.enableTTS !== false,
    newsRefreshInterval: raw.newsRefreshInterval || defaultConfig.newsRefreshInterval,
  }
}

function readConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"))
  }
  for (const p of LEGACY_PATHS) {
    if (existsSync(p)) {
      const content = JSON.parse(readFileSync(p, "utf-8"))
      try {
        mkdirSync(DATA_DIR, { recursive: true })
        writeFileSync(CONFIG_PATH, JSON.stringify(content, null, 2), "utf-8")
        logger.info(`[carousel] migrated config from legacy path to ${CONFIG_PATH}`)
      } catch {}
      return content
    }
  }
  return defaultConfig
}

export default defineEventHandler(async (event) => {
  const method = event.method

  if (method === "GET") {
    try {
      return normalizeConfig(readConfig())
    } catch {
      return defaultConfig
    }
  }

  if (method === "POST") {
    if (!event.context.disabledLogin && !event.context.user) {
      throw createError({ statusCode: 401, message: "Login required" })
    }

    const body = await readBody(event)
    if (!body) {
      throw createError({ statusCode: 400, message: "Missing body" })
    }

    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(CONFIG_PATH, JSON.stringify(body, null, 2), "utf-8")
      logger.info("[carousel] config saved")
      return { success: true }
    } catch (e: any) {
      logger.error("[carousel] save error:", e)
      throw createError({ statusCode: 500, message: `Failed to save: ${e.message}` })
    }
  }
})
