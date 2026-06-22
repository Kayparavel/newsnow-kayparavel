import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

// 获取项目根目录（server/api/carousel/index.ts -> server -> 项目根目录）
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "../../..")
const configPath = join(projectRoot, "shared/carousel.json")

console.log("[carousel] __dirname:", __dirname)
console.log("[carousel] projectRoot:", projectRoot)
console.log("[carousel] configPath:", configPath)

// 默认配置
const defaultConfig = {
  channelName: "NewsNow 频道",
  summaries: [],
  collections: [],
  programs: [],
  enableTTS: true,
}

export default defineEventHandler(async (event) => {
  const method = event.method

  // GET - 读取配置
  if (method === "GET") {
    try {
      if (!existsSync(configPath)) {
        return defaultConfig
      }
      const content = readFileSync(configPath, "utf-8")
      const config = JSON.parse(content)
      // 兼容旧配置格式
      return {
        channelName: config.channelName || defaultConfig.channelName,
        summaries: Array.isArray(config.summaries) ? config.summaries : defaultConfig.summaries,
        collections: Array.isArray(config.collections) ? config.collections : defaultConfig.collections,
        programs: Array.isArray(config.programs) ? config.programs : defaultConfig.programs,
        enableTTS: config.enableTTS !== false,
      }
    } catch {
      return defaultConfig
    }
  }

  // POST - 保存配置（需要登录）
  if (method === "POST") {
    // 检查是否需要登录
    if (!event.context.disabledLogin && !event.context.user) {
      throw createError({ statusCode: 401, message: "Login required" })
    }

    const body = await readBody(event)
    if (!body) {
      throw createError({ statusCode: 400, message: "Missing body" })
    }

    try {
      const content = JSON.stringify(body, null, 2)
      console.log("[carousel] saving to:", configPath)
      console.log("[carousel] content length:", content.length)
      writeFileSync(configPath, content, "utf-8")
      // 验证写入
      const verify = readFileSync(configPath, "utf-8")
      console.log("[carousel] verified length:", verify.length)
      logger.info("[carousel] config saved")
      return { success: true }
    } catch (e: any) {
      console.error("[carousel] save error:", e)
      throw createError({ statusCode: 500, message: `Failed to save: ${e.message}` })
    }
  }
})
