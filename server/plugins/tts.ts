import { preloadVoiceSample } from "#/utils/tts"

export default defineNitroPlugin(async (_nitro) => {
  // 预加载 TTS 语音样本
  preloadVoiceSample()
})
