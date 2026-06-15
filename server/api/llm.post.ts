import type { LLMMessage } from "#/utils/llm"
import { chatCompletion } from "#/utils/llm"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const messages = body?.messages as LLMMessage[]

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw createError({
      statusCode: 400,
      message: "Missing messages",
    })
  }

  logger.info(`[llm] request received, ${messages.length} message(s)`)

  try {
    const content = await chatCompletion(messages)
    logger.success(`[llm] response generated, ${content.length} chars`)
    return { content }
  } catch (e: any) {
    logger.error(`[llm] failed:`, e.message)
    throw createError({
      statusCode: 500,
      message: `LLM failed: ${e.message}`,
    })
  }
})
