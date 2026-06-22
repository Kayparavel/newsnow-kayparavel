import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
const MAX_COLLECTION_ITEMS = 30 // 集合新闻最大数量
const PROGRESS_MAX = 100 // 进度条最大值

// 列数对应的 CSS 类
const columnClassMap: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
}

// 最热类新闻列表（显示序号）
function NewsListHot({ items, columns = 1 }: { items: NewsItem[], columns?: number }) {
  const itemsPerColumn = Math.ceil(items.length / columns)
  const gridClass = columnClassMap[columns] || "grid-cols-1"

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex} className="space-y-1">
          {items.slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn).map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-2 p-1.5 rounded-lg bg-base hover:bg-neutral/5 transition-colors"
            >
              <span className="text-base font-bold text-neutral-400 w-7 text-right shrink-0 leading-tight">
                {colIndex * itemsPerColumn + index + 1}
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
          ))}
        </div>
      ))}
    </div>
  )
}

// 实时类新闻列表（显示时间）
function NewsListTimeline({ items, columns = 1 }: { items: NewsItem[], columns?: number }) {
  const itemsPerColumn = Math.ceil(items.length / columns)
  const gridClass = columnClassMap[columns] || "grid-cols-1"

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex} className="space-y-1">
          {items.slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn).map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 p-1.5 rounded-lg bg-base hover:bg-neutral/5 transition-colors"
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
          ))}
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
                {source?.title && <span className="text-neutral-500 ml-1">- {source.title}</span>}
              </h3>
            </div>
            {/* 新闻列表 */}
            {items.slice(0, ITEMS_PER_COLUMN).map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-2 p-1.5 rounded-lg bg-base hover:bg-neutral/5 transition-colors"
              >
                {isHot ? (
                  <span className="text-base font-bold text-neutral-400 w-7 text-right shrink-0 leading-tight">
                    {index + 1}
                  </span>
                ) : (
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
            ))}
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

export function Carousel() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [config, setConfig] = useState<CarouselConfig | null>(null)
  const [bgmEnabled, setBgmEnabled] = useState(false)
  const [bgmVolume, setBgmVolume] = useState(0.3)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const progressRef = useRef<number | null>(null)
  const setCurrentPage = useSetAtom(currentColumnIDAtom)

  // 设置当前页面为轮播
  useEffect(() => {
    setCurrentPage("carousel")
  }, [setCurrentPage])

  // 加载轮播配置
  useEffect(() => {
    import("@shared/carousel.json").then((mod) => {
      setConfig(mod.default as CarouselConfig)
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

  // 获取单个新闻源数据（使用 latest=true 强制刷新）
  const { data: singleSourceData } = useQuery<SourceResponse>({
    queryKey: ["source", currentProgram?.sourceId],
    queryFn: async () => {
      if (!currentProgram?.sourceId) return null
      return await myFetch(`/s?id=${currentProgram.sourceId}&latest=true`)
    },
    enabled: !!currentProgram?.sourceId && isPlaying && currentProgram?.type === "news",
    refetchInterval: REFETCH_INTERVAL,
  })

  // 获取集合中多个新闻源数据（使用 latest=true 强制刷新）
  const { data: collectionData } = useQuery<SourceResponse[]>({
    queryKey: ["collection", currentCollection?.id],
    queryFn: async () => {
      if (!currentCollection?.sources?.length) return null
      const results = await Promise.all(
        currentCollection.sources.map(id => myFetch<SourceResponse>(`/s?id=${id}&latest=true`))
      )
      return results
    },
    enabled: !!currentCollection?.sources?.length && isPlaying,
    refetchInterval: REFETCH_INTERVAL,
  })

  // 按源分组的集合数据
  const collectionSourcesData: SourceData[] = currentCollection?.sources
    ? currentCollection.sources.map((sourceId, index) => ({
        sourceId,
        items: collectionData?.[index]?.items || [],
      }))
    : []

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
      setCurrentIndex((prev) => (prev + 1) % config.programs.length)
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
    setCurrentIndex((prev) => (prev - 1 + config.programs.length) % config.programs.length)
    setProgress(0)
  }

  const handleNext = () => {
    if (!config) return
    setCurrentIndex((prev) => (prev + 1) % config.programs.length)
    setProgress(0)
  }

  const handleJump = (index: number) => {
    setCurrentIndex(index)
    setProgress(0)
  }

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
          {isPlaying ? "播放中" : "已暂停"} | 节目 {currentIndex + 1}/{config.programs.length}
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
                  {currentProgram?.duration}秒
                  {currentProgram?.columns && currentProgram.columns > 1 && ` | ${currentProgram.columns} 列`}
                </p>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex gap-2 items-center">
              {/* BGM 控制 */}
              {playlistConfig?.tracks?.length > 0 && (
                <button
                  type="button"
                  className={$("btn p-2 rounded-lg", bgmEnabled ? "bg-primary/20 text-primary i-ph:music-notes-fill" : "bg-neutral/20 hover:bg-neutral/30 op-80 i-ph:music-notes")}
                  onClick={() => setBgmEnabled(!bgmEnabled)}
                  title={bgmEnabled ? "关闭背景音乐" : "开启背景音乐"}
                />
              )}
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
            {sources[currentProgram.sourceId]?.type === "hottest" ? (
              <NewsListHot
                items={singleSourceData.items.slice(0, (currentProgram.columns || 1) * ITEMS_PER_COLUMN)}
                columns={currentProgram.columns || 1}
              />
            ) : (
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
          <div className="w-full max-w-6xl text-center">
            <div className="p-8 rounded-lg bg-primary/10">
              <p className="text-lg text-neutral-600">热点汇总功能开发中...</p>
            </div>
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
