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

  // 检查是否过期
  if (Date.now() > cached.expires) {
    return {
      success: false,
      message: "Cache expired",
    }
  }

  return {
    success: true,
    summary: cached.summary,
    ttsAudio: cached.ttsAudio,
  }
})
