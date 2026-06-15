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
  })

  const content = res?.choices?.[0]?.message?.content
  if (!content) throw new Error("No content in LLM response")

  return content
}
