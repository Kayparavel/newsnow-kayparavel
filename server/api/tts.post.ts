import { synthesizeSpeech } from "#/utils/tts"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const text = body?.text as string

  if (!text) {
    throw createError({
      statusCode: 400,
      message: "Missing text",
    })
  }

  logger.info(`[tts] request received, text length: ${text.length}`)

  try {
    const audioBuffer = await synthesizeSpeech(text)
    logger.success(`[tts] synthesized ${audioBuffer.length} bytes`)

    setResponseHeaders(event, {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-cache",
    })

    return audioBuffer
  } catch (e: any) {
    logger.error(`[tts] failed:`, e.message)
    throw createError({
      statusCode: 500,
      message: `TTS failed: ${e.message}`,
    })
  }
})
