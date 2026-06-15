import process from "node:process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { Buffer } from "node:buffer"
import { ofetch } from "ofetch"

const DEFAULT_TTS_BASE_URL = "https://api.xiaomimimo.com/v1"

const TTS_CACHE_TTL = 3600_000
const TTS_CACHE_MAX = 50
const ttsCache = new Map<string, { data: Buffer, time: number }>()

function evictTtsCache() {
  const now = Date.now()
  for (const [k, v] of ttsCache) {
    if (now - v.time >= TTS_CACHE_TTL) ttsCache.delete(k)
  }
  while (ttsCache.size >= TTS_CACHE_MAX) {
    const first = ttsCache.keys().next().value
    if (first !== undefined) ttsCache.delete(first)
    else break
  }
}

let voiceBase64: string | undefined
let voiceMime = "audio/wav"

function loadVoiceSample(): string {
  if (voiceBase64) return voiceBase64

  const samplePath = process.env.TTS_VOICE_SAMPLE_PATH
  if (!samplePath) throw new Error("TTS_VOICE_SAMPLE_PATH not configured")

  const projectRoot = resolve(process.cwd())
  const resolved = samplePath.startsWith(".") ? join(projectRoot, samplePath) : samplePath
  const buf = readFileSync(resolved)
  const ext = resolved.split(".").pop()?.toLowerCase()
  if (ext === "mp3") {
    voiceMime = "audio/mpeg"
  } else {
    voiceMime = "audio/wav"
  }

  voiceBase64 = buf.toString("base64")
  const sizeMB = voiceBase64.length / 1024 / 1024
  if (sizeMB > 10) {
    voiceBase64 = undefined
    throw new Error(`Voice sample base64 exceeds 10MB limit (${sizeMB.toFixed(1)}MB)`)
  }
  logger.info(`Voice sample loaded: ${resolved} (${(buf.length / 1024).toFixed(1)}KB, ${voiceMime}, base64 ${sizeMB.toFixed(1)}MB)`)
  return voiceBase64
}

export function preloadVoiceSample() {
  try {
    loadVoiceSample()
  } catch {}
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const cached = ttsCache.get(text)
  if (cached && Date.now() - cached.time < TTS_CACHE_TTL) {
    logger.info(`[tts] cache hit, ${cached.data.length} bytes`)
    return cached.data
  }

  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) throw new Error("MIMO_API_KEY not configured")

  const baseUrl = process.env.TTS_BASE_URL || DEFAULT_TTS_BASE_URL
  const voice = loadVoiceSample()

  const res = await ofetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: {
      model: "mimo-v2.5-tts-voiceclone",
      messages: [
        { role: "user" as const, content: process.env.TTS_STYLE_PROMPT || "" },
        { role: "assistant" as const, content: text },
      ],
      audio: {
        format: "wav",
        voice: `data:${voiceMime};base64,${voice}`,
      },
    },
  })

  const audioData = res?.choices?.[0]?.message?.audio?.data
  if (!audioData) throw new Error("No audio data in TTS response")

  const buf = Buffer.from(audioData, "base64")
  evictTtsCache()
  ttsCache.set(text, { data: buf, time: Date.now() })
  return buf
}
