import type { Buffer } from "node:buffer"
import { synthesizeSpeech } from "#/utils/tts"

interface CarouselTTSRequest {
  sourceId: string
  sourceName: string
  items: { id: string, title: string }[]
  isSummary?: boolean
  summaryText?: string
}

interface TTSResponse {
  header: string | null
  contents: { id: string, audio: string }[]
  footer: string | null
  summaryAudio?: string // base64，仅汇总时返回
}

// TTS 音频缓存
const ttsAudioCache = new Map<string, { data: Buffer, time: number }>()
const TTS_CACHE_TTL = 3600_000 // 1小时

async function getOrSynthesize(text: string): Promise<Buffer> {
  const cached = ttsAudioCache.get(text)
  if (cached && Date.now() - cached.time < TTS_CACHE_TTL) {
    return cached.data
  }

  const audio = await synthesizeSpeech(text)
  ttsAudioCache.set(text, { data: audio, time: Date.now() })
  return audio
}

export default defineEventHandler(async (event): Promise<TTSResponse> => {
  const body = await readBody(event)
  const { sourceId, sourceName, items, isSummary, summaryText } = body as CarouselTTSRequest

  if (!sourceId) {
    throw createError({
      statusCode: 400,
      message: "Missing sourceId",
    })
  }

  logger.info(`[carousel-tts] request for ${sourceId}, ${items?.length || 0} items, isSummary: ${isSummary}, summaryText length: ${summaryText?.length || 0}`)

  try {
    if (isSummary && summaryText) {
      // 汇总内容：直接对 summary 文本调用 TTS
      const audio = await getOrSynthesize(summaryText)
      logger.success(`[carousel-tts] summary synthesized for ${sourceId}`)
      return {
        header: null,
        contents: [],
        footer: null,
        summaryAudio: audio.toString("base64"),
      }
    }

    // 新闻源：分段 TTS
    const headerText = `下面播报${sourceName}最新新闻。`
    const footerText = `以上就是本时段${sourceName}最新新闻。`

    // 并行生成头尾和内容
    const [headerAudio, footerAudio, ...contentAudios] = await Promise.all([
      getOrSynthesize(headerText),
      getOrSynthesize(footerText),
      ...items.map(item => getOrSynthesize(item.title)),
    ])

    logger.success(`[carousel-tts] synthesized ${items.length} items for ${sourceId}`)

    return {
      header: headerAudio.toString("base64"),
      contents: items.map((item, i) => ({
        id: item.id,
        audio: contentAudios[i].toString("base64"),
      })),
      footer: footerAudio.toString("base64"),
    }
  } catch (e: any) {
    logger.error(`[carousel-tts] failed:`, e.message)
    throw createError({
      statusCode: 500,
      message: `TTS failed: ${e.message}`,
    })
  }
})
