import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { NewsItem, SourceID } from "@shared/types"
import type { CarouselConfig, Program } from "@shared/carousel"
import { sources } from "@shared/sources"
import { NewsListHot } from "./NewsListHot"
import { NewsListTimeline } from "./NewsListTimeline"
import { CollectionList } from "./CollectionList"
import { currentColumnIDAtom } from "~/atoms"

// 常量
const DEFAULT_DURATION = 30 // 默认节目时长（秒）
const ITEMS_PER_COLUMN = 10 // 每列显示新闻数量
const PROGRESS_MAX = 100 // 进度条最大值

// base64 转 Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = Array.from({ length: byteCharacters.length })
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

// 播放列表配置
interface PlaylistConfig {
  enabled: boolean
  volume: number
  tracks: string[]
}

// 汇总结果接口
interface SummaryResult {
  title: string
  summary: string
  highlights: string[]
  sources: string[]
}

// 集合源数据
interface SourceData {
  sourceId: SourceID
  items: NewsItem[]
}

export function Carousel() {
  const queryClient = useQueryClient()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [config, setConfig] = useState<CarouselConfig | null>(null)
  const [bgmEnabled, setBgmEnabled] = useState(false)
  const [bgmVolume, setBgmVolume] = useState(0.3)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const progressRef = useRef<number | null>(null)
  const setCurrentPage = useSetAtom(currentColumnIDAtom)
  const hasCompletedFirstCycleRef = useRef(false)
  const isTTSPlayingRef = useRef(false)
  const ttsCacheRef = useRef<Map<string, {
    lastItemIds: string[]
    headerAudio: Blob | null
    footerAudio: Blob | null
    contentAudios: Map<string, Blob>
    summaryAudio: Blob | null
  }>>(new Map())

  // 设置当前页面为轮播
  useEffect(() => {
    setCurrentPage("carousel")
  }, [setCurrentPage])

  // 加载轮播配置
  useEffect(() => {
    import("@shared/carousel.json").then((mod) => {
      const config = mod.default as CarouselConfig
      setConfig(config)
      // 使用 enableTTS 作为 TTS 按钮的初始状态
      if (config.enableTTS !== undefined) {
        setTtsEnabled(config.enableTTS)
      }
    }).catch((err) => {
      console.error("Failed to load carousel config:", err)
    })
  }, [])

  // 加载播放列表配置
  const { data: playlistConfig } = useQuery<PlaylistConfig>({
    queryKey: ["playlist-config"],
    queryFn: async () => await myFetch("/playlist"),
  })

  // 初始化 BGM
  useEffect(() => {
    if (playlistConfig) {
      setBgmEnabled(playlistConfig.enabled)
      setBgmVolume(playlistConfig.volume)
    }
  }, [playlistConfig])

  // BGM 播放控制
  useEffect(() => {
    if (!playlistConfig?.tracks?.length || !bgmEnabled) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      return
    }

    const audio = new Audio()
    audio.loop = true
    audio.volume = bgmVolume
    audio.src = playlistConfig.tracks[0]
    audioRef.current = audio

    if (isPlaying) {
      audio.play().catch(console.error)
    }

    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [playlistConfig, bgmEnabled])

  // 播放/暂停时控制 BGM
  useEffect(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.play().catch(console.error)
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying])

  // 音量变化时更新
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = bgmVolume
    }
  }, [bgmVolume])

  const currentProgram = config?.programs[currentIndex]

  // 获取当前集合
  const currentCollection = currentProgram?.collectionId
    ? config?.collections.find(c => c.id === currentProgram.collectionId)
    : undefined

  // 获取当前汇总配置
  const currentSummary = currentProgram?.summaryId
    ? config?.summaries.find(s => s.id === currentProgram.summaryId)
    : undefined

  // 获取单个新闻源数据（从后端缓存，带 diff）
  const { data: singleSourceData } = useQuery<{ success: boolean, items: NewsItem[] }>({
    queryKey: ["news-cache", currentProgram?.sourceId],
    queryFn: async () => {
      if (!currentProgram?.sourceId) return null
      return await myFetch(`/carousel-news-cache?sourceId=${currentProgram.sourceId}`)
    },
    enabled: !!currentProgram?.sourceId && isPlaying && currentProgram?.type === "news",
    refetchOnWindowFocus: false,
  })

  // 获取集合中多个新闻源数据（从后端缓存，带 diff）
  const { data: collectionData } = useQuery<{ success: boolean, items: NewsItem[] }[]>({
    queryKey: ["news-cache-collection", currentCollection?.id],
    queryFn: async () => {
      if (!currentCollection?.sources?.length) return null
      const results = await Promise.all(
        currentCollection.sources.map(async (id) => {
          return await myFetch<{ success: boolean, items: NewsItem[] }>(`/carousel-news-cache?sourceId=${id}`)
        }),
      )
      return results
    },
    enabled: !!currentCollection?.sources?.length && isPlaying,
    refetchOnWindowFocus: false,
  })

  // 按源分组的集合数据
  const collectionSourcesData: SourceData[] = currentCollection?.sources
    ? currentCollection.sources.map((sourceId, index) => ({
        sourceId,
        items: collectionData?.[index]?.items || [],
      }))
    : []

  // 定时获取汇总数据
  useEffect(() => {
    if (!isPlaying || !config || !currentSummary) return

    const fetchSummary = async () => {
      try {
        const cached = await myFetch<any>(`/carousel-summary-tts?summaryId=${currentSummary.id}`)
        if (cached?.success && cached.summary) {
          queryClient.setQueryData(["summary", currentSummary.id], cached.summary)

          // 缓存 TTS 音频
          if (cached.ttsAudio) {
            const ttsCache = ttsCacheRef.current.get(currentSummary.id) || {
              lastItemIds: [],
              headerAudio: null,
              footerAudio: null,
              contentAudios: new Map(),
              summaryAudio: null,
            }
            ttsCache.summaryAudio = base64ToBlob(cached.ttsAudio, "audio/wav")
            ttsCacheRef.current.set(currentSummary.id, ttsCache)
          }
        }
      } catch (e) {
        console.error("[carousel] fetch summary failed:", e)
      }
    }

    fetchSummary()
  }, [isPlaying, currentIndex, currentSummary, config, queryClient])

  // 汇总数据（从 queryClient 获取）
  const summaryData = currentSummary?.id
    ? queryClient.getQueryData<SummaryResult>(["summary", currentSummary.id])
    : undefined

  // 轮播定时器
  useEffect(() => {
    if (!isPlaying || !config) {
      if (timerRef.current) clearInterval(timerRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
      return
    }

    const duration = config.programs[currentIndex]?.duration || DEFAULT_DURATION

    // 进度条更新（每 100ms 更新一次）
    const progressIncrement = PROGRESS_MAX / (duration * 10) // duration 秒 * 10 次/秒
    setProgress(0)
    progressRef.current = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + progressIncrement
        return next >= PROGRESS_MAX ? PROGRESS_MAX : next
      })
    }, 100)

    // 切换到下一个节目（如果 TTS 正在播放则延长）
    const switchToNext = () => {
      if (isTTSPlayingRef.current) {
        // TTS 正在播放，延长 1 秒再检查
        timerRef.current = window.setTimeout(switchToNext, 1000)
        return
      }
      setCurrentIndex((prev) => {
        const next = (prev + 1) % config.programs.length
        // 检测是否完成了一次循环
        if (next === 0 && !hasCompletedFirstCycleRef.current) {
          hasCompletedFirstCycleRef.current = true
        }
        return next
      })
      setProgress(0)
    }
    timerRef.current = window.setTimeout(switchToNext, duration * 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
    }
  }, [isPlaying, currentIndex, config])

  const handlePlay = () => {
    setIsPlaying(!isPlaying)
  }

  // 停止当前 TTS 播放
  const stopTTS = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current.currentTime = 0
      ttsAudioRef.current = null
    }
    isTTSPlayingRef.current = false
    // 恢复 BGM 音量
    if (audioRef.current && bgmEnabled) {
      audioRef.current.volume = bgmVolume
    }
  }, [bgmEnabled, bgmVolume])

  const handlePrev = () => {
    if (!config) return
    stopTTS()
    setCurrentIndex(prev => (prev - 1 + config.programs.length) % config.programs.length)
    setProgress(0)
  }

  const handleNext = () => {
    if (!config) return
    stopTTS()
    setCurrentIndex(prev => (prev + 1) % config.programs.length)
    setProgress(0)
  }

  const handleJump = (index: number) => {
    stopTTS()
    setCurrentIndex(index)
    setProgress(0)
  }

  // 播放 TTS 音频队列
  const playTTSAudio = useCallback(async (sourceId: string, isSummary: boolean = false) => {
    if (!ttsEnabled) return
    // 汇总不受首轮循环影响，新闻源需要等待首轮循环完成
    if (!isSummary && !hasCompletedFirstCycleRef.current) return

    const cache = ttsCacheRef.current.get(sourceId)
    if (!cache) return

    // BGM 闪避：降低音量
    const originalVolume = bgmVolume
    if (audioRef.current && bgmEnabled) {
      audioRef.current.volume = originalVolume * 0.2
    }

    isTTSPlayingRef.current = true

    try {
      if (isSummary && cache.summaryAudio) {
        // 播放汇总音频
        const audio = new Audio(URL.createObjectURL(cache.summaryAudio))
        ttsAudioRef.current = audio
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve()
          audio.onerror = () => resolve()
          audio.play().catch(() => resolve())
        })
      } else {
        // 播放新闻音频：header -> contents -> footer
        if (cache.headerAudio && isTTSPlayingRef.current) {
          const audio = new Audio(URL.createObjectURL(cache.headerAudio))
          ttsAudioRef.current = audio
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve()
            audio.onerror = () => resolve()
            audio.play().catch(() => resolve())
          })
        }

        for (const itemId of cache.lastItemIds) {
          if (!isTTSPlayingRef.current) break
          const contentAudio = cache.contentAudios.get(itemId)
          if (contentAudio) {
            const audio = new Audio(URL.createObjectURL(contentAudio))
            ttsAudioRef.current = audio
            await new Promise<void>((resolve) => {
              audio.onended = () => resolve()
              audio.onerror = () => resolve()
              audio.play().catch(() => resolve())
            })
          }
        }

        if (cache.footerAudio && isTTSPlayingRef.current) {
          const audio = new Audio(URL.createObjectURL(cache.footerAudio))
          ttsAudioRef.current = audio
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve()
            audio.onerror = () => resolve()
            audio.play().catch(() => resolve())
          })
        }
      }
    } finally {
      // 恢复 BGM 音量
      if (audioRef.current && bgmEnabled) {
        audioRef.current.volume = originalVolume
      }
      ttsAudioRef.current = null
      isTTSPlayingRef.current = false
    }
  }, [ttsEnabled, bgmVolume, bgmEnabled])

  // 当节目切换时播放 TTS
  useEffect(() => {
    if (!isPlaying || !ttsEnabled || !currentProgram) return

    // 检查当前节目是否启用了 TTS
    const programTtsEnabled = currentProgram.tts ?? false
    if (!programTtsEnabled) return

    const sourceId = currentProgram.type === "news"
      ? currentProgram.sourceId
      : currentProgram.type === "summary"
        ? currentProgram.summaryId
        : undefined

    if (sourceId) {
      const isSummary = currentProgram.type === "summary"
      // 轮询等待 TTS 缓存准备好
      let retryCount = 0
      const maxRetries = 30 // 最多等待 30 秒
      const checkAndPlay = () => {
        const cache = ttsCacheRef.current.get(sourceId)
        if (cache && (cache.summaryAudio || cache.headerAudio || cache.contentAudios.size > 0)) {
          playTTSAudio(sourceId, isSummary)
        } else if (retryCount < maxRetries) {
          retryCount++
          setTimeout(checkAndPlay, 1000)
        }
      }
      // 延迟 2 秒开始检查，等待数据加载
      const timer = setTimeout(checkAndPlay, 2000)
      return () => clearTimeout(timer)
    }
  }, [currentIndex, isPlaying, ttsEnabled, currentProgram, playTTSAudio])

  // 获取节目显示名称
  const getProgramLabel = (program: Program) => {
    if (program.type === "news" && program.sourceId) {
      const source = sources[program.sourceId]
      return `${source?.name || ""}${source?.title ? ` - ${source.title}` : ""}` || program.sourceId
    }
    if (program.type === "collection" && program.collectionId) {
      const collection = config?.collections.find(c => c.id === program.collectionId)
      return collection?.name || "集合"
    }
    return program.label || program.type
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <p className="text-neutral-500">加载轮播配置中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[80vh] p-4 md:p-8">
      {/* 频道标题 */}
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{config.channelName}</h1>
        <p className="text-neutral-500 text-sm mt-2">
          {isPlaying ? "播放中" : "已暂停"}
          {" "}
          | 节目
          {currentIndex + 1}
          /
          {config.programs.length}
        </p>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center">
        {/* 节目信息 */}
        <div className="w-full max-w-6xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {currentProgram?.sourceId && (
                <div
                  className="w-10 h-10 rounded-full bg-cover"
                  style={{ backgroundImage: `url(/icons/${currentProgram.sourceId.split("-")[0]}.png)` }}
                />
              )}
              <div>
                <h2 className="text-xl font-bold">
                  {currentProgram ? getProgramLabel(currentProgram) : "节目"}
                </h2>
                <p className="text-sm text-neutral-500">
                  {currentProgram?.type === "news" && "新闻"}
                  {currentProgram?.type === "collection" && "集合"}
                  {currentProgram?.type === "summary" && "热点汇总"}
                  {currentProgram?.type === "break" && "休息"}
                  {" | "}
                  {currentProgram?.duration}
                  秒
                  {currentProgram?.columns && currentProgram.columns > 1 && ` | ${currentProgram.columns} 列`}
                  {currentProgram?.sourceId && (() => {
                    const interval = sources[currentProgram.sourceId]?.interval
                    if (!interval) return null
                    const minutes = Math.floor(interval / 60000)
                    return ` | 每${minutes}分钟更新`
                  })()}
                </p>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex gap-2 items-center">
              {/* BGM 控制 */}
              {playlistConfig?.tracks?.length > 0 && (
                <button
                  type="button"
                  className={$("btn p-2 rounded-lg", bgmEnabled ? "bg-primary text-white i-ph:music-notes-fill" : "bg-neutral/20 hover:bg-neutral/30 op-80 i-ph:music-notes")}
                  onClick={() => setBgmEnabled(!bgmEnabled)}
                  title={bgmEnabled ? "关闭背景音乐" : "开启背景音乐"}
                />
              )}
              {/* TTS 控制 */}
              <button
                type="button"
                className={$("btn p-2 rounded-lg", ttsEnabled ? "bg-primary text-white i-ph:speaker-high-fill" : "bg-neutral/20 hover:bg-neutral/30 op-80 i-ph:speaker-simple-slash")}
                onClick={() => {
                  const newValue = !ttsEnabled
                  setTtsEnabled(newValue)
                  if (!newValue) {
                    stopTTS()
                  }
                }}
                title={ttsEnabled ? "关闭语音播报" : "开启语音播报"}
              />
              <button
                type="button"
                className="btn p-2 rounded-lg bg-neutral/20 hover:bg-neutral/30 i-ph:skip-back-fill op-80"
                onClick={handlePrev}
              />
              <button
                type="button"
                className={$("btn p-3 rounded-lg bg-primary text-white", isPlaying ? "i-ph:pause-fill" : "i-ph:play-fill")}
                onClick={handlePlay}
              />
              <button
                type="button"
                className="btn p-2 rounded-lg bg-neutral/20 hover:bg-neutral/30 i-ph:skip-forward-fill op-80"
                onClick={handleNext}
              />
            </div>
          </div>

          {/* 进度条 */}
          <div className="w-full h-1 bg-neutral/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 新闻内容 */}
        {currentProgram?.type === "news" && singleSourceData?.items && currentProgram.sourceId && (
          <div className="w-full max-w-6xl">
            {sources[currentProgram.sourceId]?.type === "hottest"
              ? (
                  <NewsListHot
                    items={singleSourceData.items.slice(0, (currentProgram.columns || 1) * ITEMS_PER_COLUMN)}
                    columns={currentProgram.columns || 1}
                  />
                )
              : (
                  <NewsListTimeline
                    items={singleSourceData.items.slice(0, (currentProgram.columns || 1) * ITEMS_PER_COLUMN)}
                    columns={currentProgram.columns || 1}
                  />
                )}
          </div>
        )}

        {/* 集合内容 - 每个源一列 */}
        {currentProgram?.type === "collection" && collectionSourcesData.length > 0 && (
          <div className="w-full max-w-6xl">
            <CollectionList sourcesData={collectionSourcesData} />
          </div>
        )}

        {currentProgram?.type === "summary" && (
          <div className="w-full max-w-6xl">
            {summaryData
              ? (
                  <div className="p-6 rounded-lg bg-base border border-neutral/10">
                    <h3 className="text-xl font-bold mb-4">{summaryData.title || "新闻汇总"}</h3>
                    <p className="text-base leading-relaxed mb-4 whitespace-pre-line">{summaryData.summary}</p>
                    {summaryData.highlights?.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-neutral-500 mb-2">要点：</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {summaryData.highlights.map((item, i) => (
                            <li key={i} className="text-sm">{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {summaryData.sources?.length > 0 && (
                      <div className="text-xs text-neutral-400">
                        来源：
                        {summaryData.sources.join("、")}
                      </div>
                    )}
                  </div>
                )
              : (
                  <div className="text-center p-8 rounded-lg bg-neutral/10">
                    <p className="text-lg text-neutral-500">暂无汇总数据</p>
                  </div>
                )}
          </div>
        )}

        {currentProgram?.type === "break" && (
          <div className="w-full max-w-6xl text-center">
            <div className="p-8 rounded-lg bg-neutral/10">
              <p className="text-lg text-neutral-400">休息中...</p>
            </div>
          </div>
        )}
      </div>

      {/* 节目单 */}
      <div className="mt-6 relative flex items-center gap-2 pb-2">
        <button
          type="button"
          className="btn px-2 py-1.5 rounded-lg bg-neutral/10 hover:bg-neutral/20 shrink-0 i-ph:caret-left-fill"
          onClick={() => {
            const container = document.getElementById("program-list")
            if (container) container.scrollLeft -= 200
          }}
        />
        <div id="program-list" className="flex-1 flex gap-1 overflow-x-auto scrollbar-hidden">
          {config.programs.map((program, index) => (
            <button
              key={index}
              type="button"
              className={$("btn px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all shrink-0", index === currentIndex ? "bg-primary text-white" : "bg-neutral/10 hover:bg-neutral/20")}
              onClick={() => handleJump(index)}
            >
              {getProgramLabel(program)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn px-2 py-1.5 rounded-lg bg-neutral/10 hover:bg-neutral/20 shrink-0 i-ph:caret-right-fill"
          onClick={() => {
            const container = document.getElementById("program-list")
            if (container) container.scrollLeft += 200
          }}
        />
      </div>
    </div>
  )
}
