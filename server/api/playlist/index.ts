import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "../../..")
const playlistPath = join(projectRoot, "data/playlist.json")

// 默认配置
const defaultPlaylist = {
  enabled: false,
  volume: 0.3,
  tracks: [],
}

export default defineEventHandler(async (event) => {
  const method = event.method

  // GET - 读取播放列表
  if (method === "GET") {
    try {
      if (!existsSync(playlistPath)) {
        return defaultPlaylist
      }
      const content = readFileSync(playlistPath, "utf-8")
      return JSON.parse(content)
    } catch {
      return defaultPlaylist
    }
  }

  // POST - 保存播放列表（需要登录）
  if (method === "POST") {
    if (!event.context.disabledLogin && !event.context.user) {
      throw createError({ statusCode: 401, message: "Login required" })
    }

    const body = await readBody(event)
    if (!body) {
      throw createError({ statusCode: 400, message: "Missing body" })
    }

    try {
      writeFileSync(playlistPath, JSON.stringify(body, null, 2), "utf-8")
      logger.info("[playlist] config saved")
      return { success: true }
    } catch (e: any) {
      throw createError({ statusCode: 500, message: `Failed to save: ${e.message}` })
    }
  }
})
