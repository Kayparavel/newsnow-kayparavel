import { getCacheTable } from "#/database/cache"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sourceId = query.sourceId as string

  if (!sourceId) {
    throw createError({
      statusCode: 400,
      message: "Missing sourceId",
    })
  }

  const cacheTable = await getCacheTable()
  if (!cacheTable) {
    return {
      success: false,
      message: "Cache not available",
    }
  }

  const cached = await cacheTable.get(sourceId)
  if (!cached) {
    return {
      success: false,
      message: "No cached result",
    }
  }

  const ttsData = await cacheTable.getTtsData(sourceId)

  return {
    success: true,
    items: cached.items,
    updated: cached.updated,
    ttsAudio: ttsData,
  }
})
