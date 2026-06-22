import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "../../..")
const dataDir = join(projectRoot, "data")

console.log("[playlist/file] __dirname:", __dirname)
console.log("[playlist/file] projectRoot:", projectRoot)
console.log("[playlist/file] dataDir:", dataDir)

export default defineEventHandler((event) => {
  const name = getRouterParam(event, "name")
  if (!name) {
    throw createError({ statusCode: 400, message: "Missing file name" })
  }

  // 安全检查：只允许访问 mp3 文件，防止路径遍历
  const safeName = name.replace(/[^\w\-.]/g, "")
  if (!safeName.endsWith(".mp3")) {
    throw createError({ statusCode: 400, message: "Invalid file type" })
  }

  const filePath = join(dataDir, safeName)
  console.log("[playlist/file] requested:", name, "-> safeName:", safeName, "-> filePath:", filePath, "-> exists:", existsSync(filePath))
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: "File not found" })
  }

  const content = readFileSync(filePath)
  setResponseHeaders(event, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=86400",
  })
  return content
})
