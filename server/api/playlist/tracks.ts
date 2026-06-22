import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "../../..")
const dataDir = join(projectRoot, "data")

export default defineEventHandler(() => {
  try {
    const files = readdirSync(dataDir)
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
