import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

const DATA_DIR = resolve(process.cwd(), ".data")
const LEGACY_DATA_DIR = resolve(process.cwd(), "data")

function getActiveDir(): string {
  return existsSync(DATA_DIR) ? DATA_DIR : LEGACY_DATA_DIR
}

export default defineEventHandler(() => {
  try {
    const dir = getActiveDir()
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
    const tracks = files
      .filter(file => file.endsWith(".mp3"))
      .map(file => ({
        filename: file,
        name: file.replace(/\.mp3$/, "").replace(/[-_]/g, " "),
        url: `/api/playlist/file/${encodeURIComponent(file)}`,
      }))
    return tracks
  } catch {
    return []
  }
})
