import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

const DATA_DIR = resolve(process.cwd(), ".data")
const PLAYLIST_PATH = join(DATA_DIR, "playlist.json")
const LEGACY_PLAYLIST_PATH = resolve(process.cwd(), "data/playlist.json")

const defaultPlaylist = {
  enabled: false,
  volume: 0.3,
  tracks: [],
}

function readPlaylist() {
  if (existsSync(PLAYLIST_PATH)) {
    return JSON.parse(readFileSync(PLAYLIST_PATH, "utf-8"))
  }
  if (existsSync(LEGACY_PLAYLIST_PATH)) {
    const content = JSON.parse(readFileSync(LEGACY_PLAYLIST_PATH, "utf-8"))
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(PLAYLIST_PATH, JSON.stringify(content, null, 2), "utf-8")
      logger.info(`[playlist] migrated from legacy path to ${PLAYLIST_PATH}`)
    } catch {}
    return content
  }
  return defaultPlaylist
}

export default defineEventHandler(async (event) => {
  const method = event.method

  if (method === "GET") {
    try {
      return readPlaylist()
    } catch {
      return defaultPlaylist
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
      writeFileSync(PLAYLIST_PATH, JSON.stringify(body, null, 2), "utf-8")
      logger.info("[playlist] config saved")
      return { success: true }
    } catch (e: any) {
      throw createError({ statusCode: 500, message: `Failed to save: ${e.message}` })
    }
  }
})
