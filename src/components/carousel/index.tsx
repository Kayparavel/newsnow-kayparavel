import { useRef, useState } from "react"
import { useTTS } from "./hooks/useTTS"
import { useLLM } from "./hooks/useLLM"

export function Carousel() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentText, setCurrentText] = useState("")
  const [llmResult, setLlmResult] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tts = useTTS()
  const llm = useLLM()

  const handleTestTTS = async () => {
    const testText = "这是一条测试语音，用于验证 TTS 功能是否正常工作。"
    setCurrentText(testText)
    try {
      const blob = await tts.mutateAsync(testText)
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.src = url
        await audioRef.current.play()
      }
    } catch (err) {
      console.error("TTS failed:", err)
    }
  }

  const handleTestLLM = async () => {
    try {
      const result = await llm.mutateAsync([
        { role: "system", content: "你是一个新闻播报员。请用简洁的中文回答。" },
        { role: "user", content: "请用一句话介绍你自己。" },
      ])
      setLlmResult(result)
    } catch (err) {
      console.error("LLM failed:", err)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">新闻轮播</h1>
        <p className="text-neutral-500">全自动新闻播报系统</p>
      </div>

      <div className="flex gap-4 mb-8">
        <button
          type="button"
          className="btn px-6 py-3 rounded-xl bg-primary text-white"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? "暂停" : "开始轮播"}
        </button>

        <button
          type="button"
          className="btn px-6 py-3 rounded-xl bg-neutral/10"
          onClick={handleTestTTS}
          disabled={tts.isPending}
        >
          {tts.isPending ? "合成中..." : "测试 TTS"}
        </button>

        <button
          type="button"
          className="btn px-6 py-3 rounded-xl bg-neutral/10"
          onClick={handleTestLLM}
          disabled={llm.isPending}
        >
          {llm.isPending ? "生成中..." : "测试 LLM"}
        </button>
      </div>

      {currentText && (
        <div className="max-w-md p-4 rounded-lg bg-neutral/10 mb-4">
          <p className="text-sm text-neutral-600">播报内容:</p>
          <p className="mt-2">{currentText}</p>
        </div>
      )}

      {llmResult && (
        <div className="max-w-md p-4 rounded-lg bg-primary/10 mb-4">
          <p className="text-sm text-primary">LLM 响应:</p>
          <p className="mt-2">{llmResult}</p>
        </div>
      )}

      {tts.isError && (
        <p className="text-red-500 mt-4">
          {"TTS 错误: "}
          {tts.error?.message}
        </p>
      )}

      {llm.isError && (
        <p className="text-red-500 mt-4">
          {"LLM 错误: "}
          {llm.error?.message}
        </p>
      )}

      <audio ref={audioRef} className="hidden" />
    </div>
  )
}
