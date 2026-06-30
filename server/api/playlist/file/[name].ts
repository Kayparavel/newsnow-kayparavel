import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

const DATA_DIR = resolve(process.cwd(), ".data")
const LEGACY_DATA_DIR = resolve(process.cwd(), "data")

function resolveFile(safeName: string): string | null {
  const newPath = join(DATA_DIR, safeName)
  if (existsSync(newPath)) return newPath
  const oldPath = join(LEGACY_DATA_DIR, safeName)
  if (existsSync(oldPath)) return oldPath
  return null
}

export default defineEventHandler((event) => {
  const name = getRouterParam(event, "name")
  if (!name) {
    throw createError({ statusCode: 400, message: "Missing file name" })
  }

  const safeName = name.replace(/[^\w\-.]/g, "")
  if (!safeName.endsWith(".mp3")) {
    throw createError({ statusCode: 400, message: "Invalid file type" })
  }

  const filePath = resolveFile(safeName)
  if (!filePath) {
    throw createError({ statusCode: 404, message: "File not found" })
  }

  const content = readFileSync(filePath)
  setResponseHeaders(event, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=86400",
  })
  return content
})
