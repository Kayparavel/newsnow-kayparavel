import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { NewsItem, SourceID, SourceResponse } from "@shared/types"
import { sources } from "@shared/sources"
import { relativeTime } from "@shared/utils"
import { currentColumnIDAtom } from "~/atoms"

// 集合配置
interface Collection {
  id: string
  name: string
  sources: SourceID[]
}

// 轮播配置类型
interface Program {
  type: "news" | "summary" | "break" | "collection"
  sourceId?: SourceID
  summaryId?: string
  collectionId?: string
  duration: number
  label?: string
  tts?: boolean
  columns?: number
}

interface CarouselConfig {
  channelName: string
  collections: Collection[]
  programs: Program[]
  enableTTS: boolean
}

// 常量
const REFETCH_INTERVAL = 60_000 // 数据刷新间隔（毫秒）
const DEFAULT_DURATION = 30 // 默认节目时长（秒）
const ITEMS_PER_COLUMN = 10 // 每列显示新闻数量
const PROGRESS_MAX = 100 // 进度条最大值

// base64 转 Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

// 列数对应的 CSS 类
const columnClassMap: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
}

// 最热类新闻列表（显示序号 + 排名变化）
function NewsListHot({ items, columns = 1 }: { items: NewsItem[], columns?: number }) {
  const itemsPerColumn = Math.ceil(items.length / columns)
  const gridClass = columnClassMap[columns] || "grid-cols-1"

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex} className="space-y-1">
          {items.slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn).map((item, index) => {
            const diff = item.extra?.diff
            // diff === undefined 表示新上榜（在缓存中找不到）
            const isNew = diff === undefined
            const isUp = diff !== undefined && diff > 0
            const isDown = diff !== undefined && diff < 0
            // 新上榜或上升标红，下降标绿
            const bgClass = isNew || isUp ? "bg-red/10" : isDown ? "bg-green/10" : ""

            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 p-1.5 rounded-lg ${bgClass} hover:bg-neutral/5 transition-colors`}
              >
                <span className="text-base font-bold text-neutral-400 w-7 text-right shrink-0 leading-tight relative">
                  {colIndex * itemsPerColumn + index + 1}
                  {isNew && (
                    <span className="absolute -top-1 -right-2 text-[10px] text-red font-bold">新</span>
                  )}
                  {isUp && (
                    <span className="absolute -top-1 -right-2 text-[10px] text-red font-bold">+{diff}</span>
                  )}
                  {isDown && (
                    <span className="absolute -top-1 -right-2 text-[10px] text-green font-bold">{diff}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-medium hover:text-primary line-clamp-2 leading-tight"
                  >
                    {item.title}
                  </a>
                  {item.extra?.info && item.extra.info !== false && (
                    <p className="text-sm text-neutral-500 leading-tight line-clamp-1">{item.extra.info}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// 实时类新闻列表（显示时间 + 新增标红）
function NewsListTimeline({ items, columns = 1 }: { items: NewsItem[], columns?: number }) {
  const itemsPerColumn = Math.ceil(items.length / columns)
  const gridClass = columnClassMap[columns] || "grid-cols-1"

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex} className="space-y-1">
          {items.slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn).map(item => {
            const isNew = item.extra?._isNew
            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 p-1.5 rounded-lg ${isNew ? "bg-red/10" : "bg-base"} hover:bg-neutral/5 transition-colors`}
              >
                <span className="text-xs text-neutral-400 w-16 shrink-0 leading-tight">
                  {item.pubDate ? relativeTime(item.pubDate) : item.extra?.date ? relativeTime(item.extra.date) : ""}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-medium hover:text-primary line-clamp-2 leading-tight"
                  >
                    {item.title}
                  </a>
                  {item.extra?.info && item.extra.info !== false && (
                    <p className="text-sm text-neutral-500 leading-tight line-clamp-1">{item.extra.info}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// 集合列表组件（用于多源集合，每个源一列，显示源标题）
interface SourceData {
  sourceId: SourceID
  items: NewsItem[]
}

function CollectionList({ sourcesData }: { sourcesData: SourceData[] }) {
  const columns = sourcesData.length
  const gridClass = columnClassMap[columns] || "grid-cols-1"

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {sourcesData.map(({ sourceId, items }) => {
        const source = sources[sourceId]
        const isHot = source?.type === "hottest"
        return (
          <div key={sourceId} className="space-y-1">
            {/* 源标题 */}
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-6 h-6 rounded-full bg-cover"
                style={{ backgroundImage: `url(/icons/${sourceId.split("-")[0]}.png)` }}
              />
              <h3 className="font-bold text-base">
                {source?.name || sourceId}
                {source?.title && (
                  <span className="text-neutral-500 ml-1">
                    -
                    {source.title}
                  </span>
                )}
              </h3>
            </div>
            {/* 新闻列表 */}
            {items.slice(0, ITEMS_PER_COLUMN).map((item, index) => {
              const diff = item.extra?.diff
              // 热门类：diff === undefined 表示新上榜
              const isNewHot = isHot && diff === undefined
              const isUp = diff !== undefined && diff > 0
              const isDown = diff !== undefined && diff < 0
              // 实时类：_isNew 表示新增
              const isNewTimeline = !isHot && item.extra?._isNew
              const bgClass = isNewHot || isUp || isNewTimeline
                ? "bg-red/10"
                : isDown
                  ? "bg-green/10"
                  : "bg-base"

              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-2 p-1.5 rounded-lg ${bgClass} hover:bg-neutral/5 transition-colors`}
                >
                  {isHot
                    ? (
                        <span className="text-base font-bold text-neutral-400 w-7 text-right shrink-0 leading-tight relative">
                          {index + 1}
                          {isNewHot && (
                            <span className="absolute -top-1 -right-2 text-[10px] text-red font-bold">新</span>
                          )}
                          {isUp && (
                            <span className="absolute -top-1 -right-2 text-[10px] text-red font-bold">+{diff}</span>
                          )}
                          {isDown && (
                            <span className="absolute -top-1 -right-2 text-[10px] text-green font-bold">{diff}</span>
                          )}
                        </span>
                      )
                    : (
                        <span className="text-xs text-neutral-400 w-16 shrink-0 leading-tight">
                          {item.pubDate ? relativeTime(item.pubDate) : item.extra?.date ? relativeTime(item.extra.date) : ""}
                        </span>
                      )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-medium hover:text-primary line-clamp-2 leading-tight"
                    >
                      {item.title}
                    </a>
                    {item.extra?.info && item.extra.info !== false && (
                      <p className="text-sm text-neutral-500 leading-tight line-clamp-1">{item.extra.info}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
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

  // 预获取下一个节目
  const nextIndex = config ? (currentIndex + 1) % config.programs.length : 0
  const nextProgram = config?.programs[nextIndex]

  // 正在进行的请求跟踪
  const pendingRequestsRef = useRef<Map<string, Promise<any>>>(new Map())

  // 获取或创建请求（复用正在进行的请求）
  function getOrCreateRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
    console.log(`[carousel] getOrCreateRequest called with key: ${key}, pending keys:`, Array.from(pendingRequestsRef.current.keys()))
    const pending = pendingRequestsRef.current.get(key)
    if (pending) {
      console.log(`[carousel] reusing pending request: ${key}`)
      return pending
    }

    console.log(`[carousel] creating new request: ${key}`)
    const request = factory().finally(() => {
      pendingRequestsRef.current.delete(key)
      console.log(`[carousel] request completed: ${key}`)
    })
    pendingRequestsRef.current.set(key, request)
    return request
  }

  // 预获取下一个节目
  useEffect(() => {
    if (!isPlaying || !config || !nextProgram) return

    const prefetchNext = async () => {
      try {
        if (nextProgram.type === "news" && nextProgram.sourceId) {
          const key = `source-${nextProgram.sourceId}`
          const data = await getOrCreateRequest(key, async () => {
            const response = await myFetch<SourceResponse>(`/s?id=${nextProgram.sourceId}&latest=true`)
            if (response?.items) {
              // 预获取时只标记新增，不更新缓存
              response.items = markNewItems(nextProgram.sourceId!, response.items)
            }
            return response
          })
          queryClient.setQueryData(["source", nextProgram.sourceId], data)

          // TTS：获取新增条目并生成音频
          const nextProgramTtsEnabled = nextProgram.tts ?? false
          if (ttsEnabled && nextProgramTtsEnabled && hasCompletedFirstCycleRef.current && data?.items) {
            const newItems = data.items.filter(item => item.extra?._isNew)
            if (newItems.length > 0) {
              const ttsKey = `tts-${nextProgram.sourceId}`
              const sourceName = sources[nextProgram.sourceId]?.name || nextProgram.sourceId
              try {
                const ttsData = await getOrCreateRequest(ttsKey, async () => {
                  return await myFetch<any>("/carousel-tts", {
                    method: "POST",
                    body: {
                      sourceId: nextProgram.sourceId,
                      sourceName,
                      items: newItems.map(item => ({ id: String(item.id), title: item.title })),
                    },
                    timeout: 120000,
                  })
                })
                // 缓存 TTS 音频
                const cache = ttsCacheRef.current.get(nextProgram.sourceId) || {
                  lastItemIds: [],
                  headerAudio: null,
                  footerAudio: null,
                  contentAudios: new Map(),
                  summaryAudio: null,
                }
                if (ttsData.header) {
                  cache.headerAudio = base64ToBlob(ttsData.header, "audio/wav")
                }
                if (ttsData.footer) {
                  cache.footerAudio = base64ToBlob(ttsData.footer, "audio/wav")
                }
                for (const item of ttsData.contents) {
                  cache.contentAudios.set(item.id, base64ToBlob(item.audio, "audio/wav"))
                }
                cache.lastItemIds = newItems.map(item => String(item.id))
                ttsCacheRef.current.set(nextProgram.sourceId!, cache)
              } catch (e) {
                console.error("[carousel] TTS failed:", e)
              }
            }
          }
        } else if (nextProgram.type === "collection" && nextProgram.collectionId) {
          const collection = config.collections.find(c => c.id === nextProgram.collectionId)
          if (collection?.sources?.length) {
            const key = `collection-${collection.id}`
            const data = await getOrCreateRequest(key, async () => {
              const results = await Promise.all(
                collection.sources.map(async (id) => {
                  const response = await myFetch<SourceResponse>(`/s?id=${id}&latest=true`)
                  if (response?.items) {
                    // 预获取时只标记新增，不更新缓存
                    response.items = markNewItems(id, response.items)
                  }
                  return response
                }),
              )
              return results
            })
            queryClient.setQueryData(["collection", collection.id], data)
          }
        } else if (nextProgram.type === "summary" && nextProgram.summaryId) {
          const summary = config.summaries.find(s => s.id === nextProgram.summaryId)
          if (summary?.sources?.length && summary?.prompt) {
            // 从后端读取汇总 + TTS 缓存（后端定时任务会自动更新）
            const cacheKey = `summary-tts-${summary.id}`
            const cached = await getOrCreateRequest(cacheKey, async () => {
              return await myFetch<any>(`/carousel-summary-tts?summaryId=${summary.id}`)
            })

            if (cached?.success && cached.summary) {
              queryClient.setQueryData(["summary", summary.id], cached.summary)

              // 缓存 TTS 音频
              if (cached.ttsAudio) {
                const ttsCache = ttsCacheRef.current.get(summary.id) || {
                  lastItemIds: [],
                  headerAudio: null,
                  footerAudio: null,
                  contentAudios: new Map(),
                  summaryAudio: null,
                }
                ttsCache.summaryAudio = base64ToBlob(cached.ttsAudio, "audio/wav")
                ttsCacheRef.current.set(summary.id, ttsCache)
              }
            }
          }
        }
      } catch (e) {
        console.error("[carousel] prefetch failed:", e)
      }
    }

    prefetchNext()
  }, [isPlaying, currentIndex, config, nextProgram, queryClient, ttsEnabled])

  // 缓存旧数据用于计算 diff
  const cachedSourcesRef = useRef<Map<SourceID, NewsItem[]>>(new Map())

  // 获取当前集合
  const currentCollection = currentProgram?.collectionId
    ? config?.collections.find(c => c.id === currentProgram.collectionId)
    : undefined

  // 获取当前汇总配置
  const currentSummary = currentProgram?.summaryId
    ? config?.summaries.find(s => s.id === currentProgram.summaryId)
    : undefined

  // 计算 diff 并标记新增项（同时更新缓存）
  function computeDiff(sourceId: SourceID, newItems: NewsItem[]): NewsItem[] {
    const cached = cachedSourcesRef.current.get(sourceId)
    const sourceType = sources[sourceId]?.type

    if (!cached || cached.length === 0) {
      // 首次获取，不标记，直接缓存
      cachedSourcesRef.current.set(sourceId, newItems)
      return newItems
    }

    const cachedIds = new Set(cached.map(item => String(item.id)))

    if (sourceType === "hottest") {
      // 热门类：计算排名变化
      const result = newItems.map((item, i) => {
        const oldIndex = cached.findIndex(k => String(k.id) === String(item.id))
        const diff = oldIndex === -1 ? undefined : oldIndex - i
        return {
          ...item,
          extra: {
            ...item.extra,
            diff,
          },
        }
      })
      cachedSourcesRef.current.set(sourceId, newItems)
      return result
    } else {
      // 实时类：标记新增项
      const result = newItems.map(item => ({
        ...item,
        extra: {
          ...item.extra,
          _isNew: !cachedIds.has(String(item.id)),
        },
      }))
      cachedSourcesRef.current.set(sourceId, newItems)
      return result
    }
  }

  // 标记新增项但不更新缓存（用于预获取和 TTS）
  function markNewItems(sourceId: SourceID, newItems: NewsItem[]): NewsItem[] {
    const cached = cachedSourcesRef.current.get(sourceId)
    const sourceType = sources[sourceId]?.type

    if (!cached || cached.length === 0) {
      return newItems
    }

    const cachedIds = new Set(cached.map(item => String(item.id)))

    if (sourceType === "hottest") {
      return newItems.map((item, i) => {
        const oldIndex = cached.findIndex(k => String(k.id) === String(item.id))
        const diff = oldIndex === -1 ? undefined : oldIndex - i
        return {
          ...item,
          extra: {
            ...item.extra,
            diff,
          },
        }
      })
    } else {
      return newItems.map(item => ({
        ...item,
        extra: {
          ...item.extra,
          _isNew: !cachedIds.has(String(item.id)),
        },
      }))
    }
  }

  // 获取单个新闻源数据（使用 latest=true 强制刷新）
  const { data: singleSourceData } = useQuery<SourceResponse>({
    queryKey: ["source", currentProgram?.sourceId],
    queryFn: async () => {
      if (!currentProgram?.sourceId) return null
      const key = `source-${currentProgram.sourceId}`
      return getOrCreateRequest(key, async () => {
        const response = await myFetch<SourceResponse>(`/s?id=${currentProgram.sourceId}&latest=true`)
        if (response?.items) {
          response.items = computeDiff(currentProgram.sourceId, response.items)
        }
        return response
      })
    },
    enabled: !!currentProgram?.sourceId && isPlaying && currentProgram?.type === "news",
    refetchInterval: REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
  })

  // 获取集合中多个新闻源数据（使用 latest=true 强制刷新）
  const { data: collectionData } = useQuery<SourceResponse[]>({
    queryKey: ["collection", currentCollection?.id],
    queryFn: async () => {
      if (!currentCollection?.sources?.length) return null
      const key = `collection-${currentCollection.id}`
      return getOrCreateRequest(key, async () => {
        const results = await Promise.all(
          currentCollection.sources.map(async (id) => {
            const response = await myFetch<SourceResponse>(`/s?id=${id}&latest=true`)
            if (response?.items) {
              response.items = computeDiff(id, response.items)
            }
            return response
          }),
        )
        return results
      })
    },
    enabled: !!currentCollection?.sources?.length && isPlaying,
    refetchInterval: REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
  })

  // 按源分组的集合数据
  const collectionSourcesData: SourceData[] = currentCollection?.sources
    ? currentCollection.sources.map((sourceId, index) => ({
        sourceId,
        items: collectionData?.[index]?.items || [],
      }))
    : []

  // 汇总数据（从后端定时任务缓存获取）
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

    // 切换到下一个节目
    timerRef.current = window.setTimeout(() => {
      setCurrentIndex(prev => {
        const next = (prev + 1) % config.programs.length
        // 检测是否完成了一次循环
        if (next === 0 && !hasCompletedFirstCycleRef.current) {
          hasCompletedFirstCycleRef.current = true
          console.log("[carousel] first cycle completed, TTS enabled")
        }
        return next
      })
      setProgress(0)
    }, duration * 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
    }
  }, [isPlaying, currentIndex, config])

  const handlePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const handlePrev = () => {
    if (!config) return
    setCurrentIndex(prev => (prev - 1 + config.programs.length) % config.programs.length)
    setProgress(0)
  }

  const handleNext = () => {
    if (!config) return
    setCurrentIndex(prev => (prev + 1) % config.programs.length)
    setProgress(0)
  }

  const handleJump = (index: number) => {
    setCurrentIndex(index)
    setProgress(0)
  }

  // 播放 TTS 音频队列
  const playTTSAudio = useCallback(async (sourceId: string, isSummary: boolean = false) => {
    console.log("[carousel] playTTSAudio called:", { sourceId, isSummary, ttsEnabled, hasCompletedFirstCycle: hasCompletedFirstCycleRef.current })
    if (!ttsEnabled) return
    // 汇总不受首轮循环影响，新闻源需要等待首轮循环完成
    if (!isSummary && !hasCompletedFirstCycleRef.current) return

    const cache = ttsCacheRef.current.get(sourceId)
    console.log("[carousel] TTS cache:", cache)
    if (!cache) return

    // BGM 闪避：降低音量
    const originalVolume = bgmVolume
    if (audioRef.current && bgmEnabled) {
      audioRef.current.volume = originalVolume * 0.2
    }

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
        if (cache.headerAudio) {
          const audio = new Audio(URL.createObjectURL(cache.headerAudio))
          ttsAudioRef.current = audio
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve()
            audio.onerror = () => resolve()
            audio.play().catch(() => resolve())
          })
        }

        for (const itemId of cache.lastItemIds) {
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

        if (cache.footerAudio) {
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
    }
  }, [ttsEnabled, bgmVolume, bgmEnabled])

  // 当节目切换时播放 TTS
  useEffect(() => {
    console.log("[carousel] TTS effect:", { isPlaying, ttsEnabled, currentProgram: currentProgram?.type, programTts: currentProgram?.tts })
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
          console.log("[carousel] TTS cache ready, playing...")
          playTTSAudio(sourceId, isSummary)
        } else if (retryCount < maxRetries) {
          retryCount++
          console.log(`[carousel] waiting for TTS cache... (${retryCount}/${maxRetries})`)
          setTimeout(checkAndPlay, 1000)
        } else {
          console.log("[carousel] TTS cache timeout")
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
                onClick={() => setTtsEnabled(!ttsEnabled)}
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
            {summaryLoading ? (
              <div className="text-center p-8 rounded-lg bg-primary/10">
                <p className="text-lg text-neutral-500">正在生成汇总...</p>
              </div>
            ) : summaryError ? (
              <div className="text-center p-8 rounded-lg bg-red/10">
                <p className="text-lg text-red">汇总生成失败</p>
                <p className="text-sm text-neutral-500 mt-2">{summaryError.message}</p>
              </div>
            ) : summaryData ? (
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
                    来源：{summaryData.sources.join("、")}
                  </div>
                )}
              </div>
            ) : (
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
