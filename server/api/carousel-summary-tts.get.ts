import { getSummaryTTSCache } from "#/plugins/carousel-scheduler"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const summaryId = query.summaryId as string

  if (!summaryId) {
    throw createError({
      statusCode: 400,
      message: "Missing summaryId",
    })
  }

  const cached = getSummaryTTSCache(summaryId)

  if (!cached) {
    return {
      success: false,
      message: "No cached result",
    }
  }

  return {
    success: true,
    summary: cached.summary,
    ttsAudio: cached.ttsAudio,
  }
})
