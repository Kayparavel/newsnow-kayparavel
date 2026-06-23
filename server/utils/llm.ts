import process from "node:process"
import { ofetch } from "ofetch"

const DEFAULT_LLM_BASE_URL = "https://api.xiaomimimo.com/v1"
const DEFAULT_MODEL = "mimo-v2.5-pro"

export interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  timeout?: number
}

export async function chatCompletion(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<string> {
  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) throw new Error("MIMO_API_KEY not configured")

  const baseUrl = process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL
  const model = options.model || DEFAULT_MODEL

  const res = await ofetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: {
      model,
      messages,
      max_completion_tokens: options.maxTokens || 2048,
      temperature: options.temperature || 0.7,
    },
    timeout: options.timeout || 60000,
  })

  logger.info(`[llm] response:`, JSON.stringify(res).slice(0, 500))

  const message = res?.choices?.[0]?.message
  const content = message?.content
  const reasoningContent = message?.reasoning_content

  if (!content && !reasoningContent) {
    logger.error(`[llm] no content, full response:`, JSON.stringify(res))
    throw new Error("No content in LLM response")
  }

  // 如果 content 为空但 reasoning_content 有内容，说明 token 都用在了推理上
  if (!content && reasoningContent) {
    logger.warn(`[llm] content is empty but reasoning_content exists, token limit may be too low`)
    throw new Error("LLM token limit exceeded, please increase maxTokens")
  }

  return content
}
