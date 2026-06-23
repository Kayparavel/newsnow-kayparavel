import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { SourceID } from "@shared/types"
import { sources } from "@shared/sources"

// 节目类型
type ProgramType = "news" | "summary" | "break" | "collection"

// 汇总配置
interface Summary {
  id: string
  name: string
  sources: SourceID[]
  prompt: string
  refreshInterval: number // 刷新间隔（分钟）
  tts: boolean
}

// 集合配置
interface Collection {
  id: string
  name: string
  sources: SourceID[]
}

// 节目单项目
interface Program {
  type: ProgramType
  sourceId?: SourceID
  summaryId?: string
  collectionId?: string
  duration: number
  label?: string
  tts?: boolean
  columns?: number // 1-3 列
}

// 轮播配置
interface CarouselConfig {
  channelName: string
  summaries: Summary[]
  collections: Collection[]
  programs: Program[]
  enableTTS: boolean
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// 获取可用的新闻源列表
const availableSources = Object.entries(sources)
  .filter(([, v]) => !v.redirect)
  .map(([k, v]) => ({
    id: k as SourceID,
    name: v.name,
    title: v.title,
  }))

// 播放列表配置
interface PlaylistConfig {
  enabled: boolean
  volume: number
  tracks: string[]
}

// 可用音轨
interface Track {
  filename: string
  name: string
  url: string
}

export function CarouselEditor() {
  const queryClient = useQueryClient()
  const [config, setConfig] = useState<CarouselConfig | null>(null)
  const [editingProgramIndex, setEditingProgramIndex] = useState<number | null>(null)
  const [editingSummaryIndex, setEditingSummaryIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<"programs" | "summaries" | "bgm">("programs")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "default" | "error">("loading")

  // 默认配置
  const defaultConfig: CarouselConfig = {
    channelName: "NewsNow 频道",
    summaries: [],
    collections: [],
    programs: [],
    enableTTS: true,
  }

  // 加载配置
  const { data, isLoading, error } = useQuery<CarouselConfig>({
    queryKey: ["carousel-config"],
    queryFn: async () => await myFetch("/carousel"),
    retry: false,
  })

  // 重新加载配置（强制从服务器重新获取）
  const handleReload = async () => {
    console.log("[carousel-editor] reloading config...")
    setLoadStatus("loading")
    // 清除缓存并重新获取
    queryClient.removeQueries({ queryKey: ["carousel-config"] })
    const result = await queryClient.fetchQuery({
      queryKey: ["carousel-config"],
      queryFn: async () => await myFetch("/carousel"),
    })
    if (result) {
      const isDefault = !result.programs?.length && !result.summaries?.length
      setLoadStatus(isDefault ? "default" : "success")
      setConfig({
        channelName: result.channelName || defaultConfig.channelName,
        summaries: Array.isArray(result.summaries) ? result.summaries : defaultConfig.summaries,
        collections: Array.isArray(result.collections) ? result.collections : defaultConfig.collections,
        programs: Array.isArray(result.programs) ? result.programs : defaultConfig.programs,
        enableTTS: result.enableTTS !== false,
      })
      console.log("[carousel-editor] config reloaded:", result)
    } else {
      setLoadStatus("error")
      setConfig(defaultConfig)
    }
  }

  // 监听加载状态
  useEffect(() => {
    if (isLoading) {
      setLoadStatus("loading")
      return
    }
    if (data) {
      console.log("[carousel-editor] config loaded:", data)
      // 检查是否是默认配置（空的 programs 和 summaries）
      const isDefault = !data.programs?.length && !data.summaries?.length
      setLoadStatus(isDefault ? "default" : "success")
      // 兼容旧配置格式，添加默认值
      setConfig({
        channelName: data.channelName || defaultConfig.channelName,
        summaries: Array.isArray(data.summaries) ? data.summaries : defaultConfig.summaries,
        collections: Array.isArray(data.collections) ? data.collections : defaultConfig.collections,
        programs: Array.isArray(data.programs) ? data.programs : defaultConfig.programs,
        enableTTS: data.enableTTS !== false,
      })
    } else if (error) {
      console.log("[carousel-editor] config load error:", error)
      // 配置文件不存在或加载失败，使用默认配置
      setLoadStatus("error")
      setConfig(defaultConfig)
    }
  }, [data, error, isLoading])

  // 保存配置
  const saveMutation = useMutation({
    mutationFn: async (newConfig: CarouselConfig) => {
      return await myFetch("/carousel", {
        method: "POST",
        body: newConfig,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carousel-config"] })
    },
  })

  const handleSave = () => {
    if (config) saveMutation.mutate(config)
  }

  // 重置为默认配置
  const handleReset = () => {
    // eslint-disable-next-line no-alert
    if (window.confirm("确定要重置为默认配置吗？当前配置将丢失。")) {
      setConfig({
        channelName: "NewsNow 频道",
        summaries: [],
        collections: [],
        programs: [],
        enableTTS: true,
      })
    }
  }

  // 导出配置
  const handleExport = () => {
    if (!config) return
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `carousel-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 导入配置
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as CarouselConfig
        // 验证基本结构
        if (!imported.channelName || !Array.isArray(imported.programs)) {
          throw new Error("Invalid config format")
        }
        setConfig({
          channelName: imported.channelName,
          summaries: imported.summaries || [],
          collections: imported.collections || [],
          programs: imported.programs || [],
          enableTTS: imported.enableTTS !== false,
        })
      } catch {
        // eslint-disable-next-line no-alert
        alert("导入失败：配置文件格式无效")
      }
    }
    reader.readAsText(file)
    // 重置 input 以便重复导入同一文件
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ==================== 汇总操作 ====================

  const handleAddSummary = () => {
    if (!config) return
    const newSummary: Summary = {
      id: generateId(),
      name: "新汇总",
      sources: [],
      prompt: "请根据以下新闻生成一段简洁的热点汇总...",
      refreshInterval: 30,
      tts: true,
    }
    setConfig({
      ...config,
      summaries: [...config.summaries, newSummary],
    })
    setEditingSummaryIndex(config.summaries.length)
  }

  const handleUpdateSummary = (index: number, updates: Partial<Summary>) => {
    if (!config) return
    const newSummaries = [...config.summaries]
    newSummaries[index] = { ...newSummaries[index], ...updates }
    setConfig({ ...config, summaries: newSummaries })
  }

  const handleDeleteSummary = (index: number) => {
    if (!config) return
    const summaryId = config.summaries[index].id
    // 删除汇总时，同时删除引用该汇总的节目
    const newPrograms = config.programs.filter(p => p.summaryId !== summaryId)
    const newSummaries = config.summaries.filter((_, i) => i !== index)
    setConfig({ ...config, summaries: newSummaries, programs: newPrograms })
    setEditingSummaryIndex(null)
  }

  // ==================== 集合操作 ====================

  const [editingCollectionIndex, setEditingCollectionIndex] = useState<number | null>(null)

  const handleAddCollection = () => {
    if (!config) return
    const newCollection: Collection = {
      id: generateId(),
      name: "新集合",
      sources: [],
    }
    setConfig({
      ...config,
      collections: [...config.collections, newCollection],
    })
    setEditingCollectionIndex(config.collections.length)
  }

  const handleUpdateCollection = (index: number, updates: Partial<Collection>) => {
    if (!config) return
    const newCollections = [...config.collections]
    newCollections[index] = { ...newCollections[index], ...updates }
    setConfig({ ...config, collections: newCollections })
  }

  const handleDeleteCollection = (index: number) => {
    if (!config) return
    const collectionId = config.collections[index].id
    // 删除集合时，同时删除引用该集合的节目
    const newPrograms = config.programs.filter(p => p.collectionId !== collectionId)
    const newCollections = config.collections.filter((_, i) => i !== index)
    setConfig({ ...config, collections: newCollections, programs: newPrograms })
    setEditingCollectionIndex(null)
  }

  // ==================== 节目单操作 ====================

  const handleAddProgram = (type: ProgramType) => {
    if (!config) return
    const defaultSource = availableSources[0]
    const newProgram: Program = {
      type,
      duration: type === "break" ? 10 : 60,
      label: type === "news"
        ? (defaultSource?.name || "新闻")
        : type === "summary"
          ? (config.summaries[0]?.name || "汇总")
          : type === "collection"
            ? (config.collections[0]?.name || "集合")
            : "休息",
      tts: false,
      sourceId: type === "news" ? defaultSource?.id : undefined,
      summaryId: type === "summary" ? config.summaries[0]?.id : undefined,
      collectionId: type === "collection" ? config.collections[0]?.id : undefined,
      columns: type === "news" ? 3 : type === "collection" ? 1 : undefined,
    }
    setConfig({
      ...config,
      programs: [...config.programs, newProgram],
    })
    setEditingProgramIndex(config.programs.length)
  }

  const handleUpdateProgram = (index: number, updates: Partial<Program>) => {
    if (!config) return
    const newPrograms = [...config.programs]
    newPrograms[index] = { ...newPrograms[index], ...updates }
    setConfig({ ...config, programs: newPrograms })
  }

  const handleDeleteProgram = (index: number) => {
    if (!config) return
    const newPrograms = config.programs.filter((_, i) => i !== index)
    setConfig({ ...config, programs: newPrograms })
    setEditingProgramIndex(null)
  }

  const handleMoveProgram = (index: number, direction: "up" | "down") => {
    if (!config) return
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= config.programs.length) return
    const newPrograms = [...config.programs]
    ;[newPrograms[index], newPrograms[newIndex]] = [newPrograms[newIndex], newPrograms[index]]
    setConfig({ ...config, programs: newPrograms })
    setEditingProgramIndex(newIndex)
  }

  // 获取汇总名称
  const getSummaryName = (summaryId?: string) => {
    if (!summaryId || !config) return "未选择汇总"
    const summary = config.summaries.find(s => s.id === summaryId)
    return summary?.name || "未找到汇总"
  }

  // 获取集合名称
  const getCollectionName = (collectionId?: string) => {
    if (!collectionId || !config) return "未选择集合"
    const collection = config.collections.find(c => c.id === collectionId)
    return collection?.name || "未找到集合"
  }

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <p className="text-neutral-500">加载中...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold">轮播编辑器</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn px-3 py-2 rounded-lg bg-neutral/10 hover:bg-neutral/20 text-sm"
            onClick={handleReload}
          >
            重新加载
          </button>
          <button
            type="button"
            className="btn px-3 py-2 rounded-lg bg-neutral/10 hover:bg-neutral/20 text-sm"
            onClick={handleReset}
          >
            重置
          </button>
          <button
            type="button"
            className="btn px-3 py-2 rounded-lg bg-neutral/10 hover:bg-neutral/20 text-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <button
            type="button"
            className="btn px-3 py-2 rounded-lg bg-neutral/10 hover:bg-neutral/20 text-sm"
            onClick={handleExport}
          >
            导出
          </button>
          <button
            type="button"
            className="btn px-4 py-2 rounded-lg bg-primary text-white"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "保存中..." : "保存到服务器"}
          </button>
        </div>
      </div>

      {/* 加载状态提示 */}
      {loadStatus === "default" && (
        <div className="mb-4 p-3 rounded-lg bg-blue-100 text-blue-800">
          配置文件为空，使用默认配置。请添加节目后保存。
        </div>
      )}

      {loadStatus === "error" && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-100 text-yellow-800">
          配置文件加载失败，使用默认配置。请点击"保存到服务器"创建配置文件。
        </div>
      )}

      {saveMutation.isSuccess && (
        <div className="mb-4 p-3 rounded-lg bg-green-100 text-green-800">
          保存成功！
        </div>
      )}

      {saveMutation.isError && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 text-red-800">
          保存失败:
          {" "}
          {saveMutation.error?.message}
        </div>
      )}

      {/* 频道名称 */}
      <div className="mb-6 p-4 rounded-lg bg-base border border-neutral/20">
        <label className="block text-sm font-medium mb-2">频道名称</label>
        <input
          type="text"
          className="w-full p-2 rounded border border-neutral/30 bg-base"
          value={config.channelName}
          onChange={e => setConfig({ ...config, channelName: e.target.value })}
        />
      </div>

      {/* 全局设置 */}
      <div className="mb-6 p-4 rounded-lg bg-base border border-neutral/20">
        <h2 className="text-lg font-bold mb-4">全局设置</h2>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.enableTTS}
              onChange={e => setConfig({ ...config, enableTTS: e.target.checked })}
            />
            <span className="text-sm font-medium">启用 TTS 语音播报</span>
          </label>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          className={`btn px-4 py-2 rounded-lg transition-colors ${
            activeTab === "programs"
              ? "bg-primary text-white"
              : "bg-neutral/10 hover:bg-neutral/20"
          }`}
          onClick={() => setActiveTab("programs")}
        >
          节目单
        </button>
        <button
          type="button"
          className={`btn px-4 py-2 rounded-lg transition-colors ${
            activeTab === "summaries"
              ? "bg-primary text-white"
              : "bg-neutral/10 hover:bg-neutral/20"
          }`}
          onClick={() => setActiveTab("summaries")}
        >
          汇总配置
        </button>
        <button
          type="button"
          className={`btn px-4 py-2 rounded-lg transition-colors ${
            activeTab === "collections"
              ? "bg-primary text-white"
              : "bg-neutral/10 hover:bg-neutral/20"
          }`}
          onClick={() => setActiveTab("collections")}
        >
          集合配置
        </button>
        <button
          type="button"
          className={`btn px-4 py-2 rounded-lg transition-colors ${
            activeTab === "bgm"
              ? "bg-primary text-white"
              : "bg-neutral/10 hover:bg-neutral/20"
          }`}
          onClick={() => setActiveTab("bgm")}
        >
          背景音乐
        </button>
      </div>

      {/* 汇总配置 */}
      {activeTab === "summaries" && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">汇总配置</h2>
            <button
              type="button"
              className="btn px-3 py-1.5 rounded text-sm bg-purple-100 text-purple-800"
              onClick={handleAddSummary}
            >
              + 添加汇总
            </button>
          </div>

          <div className="space-y-3">
            {config.summaries.map((summary, index) => (
              <div
                key={summary.id}
                className={`p-4 rounded-lg border transition-colors ${
                  editingSummaryIndex === index
                    ? "border-primary bg-primary/5"
                    : "border-neutral/20 bg-base hover:border-neutral/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{summary.name}</span>
                    <span className="text-sm text-neutral-500">
                      {summary.sources.length}
                      {" "}
                      个源
                    </span>
                    <span className="text-sm text-neutral-500">
                      每
                      {summary.refreshInterval}
                      {" "}
                      分钟刷新
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-neutral/10 hover:bg-neutral/20"
                      onClick={() => setEditingSummaryIndex(editingSummaryIndex === index ? null : index)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200 text-red-600"
                      onClick={() => handleDeleteSummary(index)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* 编辑面板 */}
                {editingSummaryIndex === index && (
                  <div className="mt-4 pt-4 border-t border-neutral/20 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">汇总名称</label>
                      <input
                        type="text"
                        className="w-full p-2 rounded border border-neutral/30 bg-base"
                        value={summary.name}
                        onChange={e => handleUpdateSummary(index, { name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">刷新间隔（分钟）</label>
                      <input
                        type="number"
                        className="w-full p-2 rounded border border-neutral/30 bg-base"
                        value={summary.refreshInterval}
                        onChange={e => handleUpdateSummary(index, { refreshInterval: Number(e.target.value) })}
                        min={1}
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        每隔多久重新生成一次汇总内容
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">新闻源</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3 rounded border border-neutral/30 bg-base max-h-48 overflow-y-auto">
                        {availableSources.map(s => (
                          <label key={s.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={summary.sources.includes(s.id)}
                              onChange={(e) => {
                                const newSources = e.target.checked
                                  ? [...summary.sources, s.id]
                                  : summary.sources.filter(id => id !== s.id)
                                handleUpdateSummary(index, { sources: newSources })
                              }}
                            />
                            <span className="truncate">
                              {s.name}
                              {s.title ? ` - ${s.title}` : ""}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">LLM 提示词</label>
                      <textarea
                        className="w-full p-2 rounded border border-neutral/30 bg-base min-h-[100px]"
                        value={summary.prompt}
                        onChange={e => handleUpdateSummary(index, { prompt: e.target.value })}
                        placeholder="输入用于热点汇总的 LLM 提示词..."
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={summary.tts}
                          onChange={e => handleUpdateSummary(index, { tts: e.target.checked })}
                        />
                        <span className="text-sm font-medium">TTS 播报</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {config.summaries.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              暂无汇总配置，点击上方按钮添加
            </div>
          )}
        </div>
      )}

      {/* 集合配置 */}
      {activeTab === "collections" && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">集合配置</h2>
            <button
              type="button"
              className="btn px-3 py-1.5 rounded text-sm bg-green-100 text-green-800"
              onClick={handleAddCollection}
            >
              + 添加集合
            </button>
          </div>

          <div className="space-y-3">
            {config.collections.map((collection, index) => (
              <div
                key={collection.id}
                className={`p-4 rounded-lg border transition-colors ${
                  editingCollectionIndex === index
                    ? "border-primary bg-primary/5"
                    : "border-neutral/20 bg-base hover:border-neutral/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{collection.name}</span>
                    <span className="text-sm text-neutral-500">
                      {collection.sources.length}
                      {" "}
                      个源
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-neutral/10 hover:bg-neutral/20"
                      onClick={() => setEditingCollectionIndex(editingCollectionIndex === index ? null : index)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200 text-red-600"
                      onClick={() => handleDeleteCollection(index)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* 编辑面板 */}
                {editingCollectionIndex === index && (
                  <div className="mt-4 pt-4 border-t border-neutral/20 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">集合名称</label>
                      <input
                        type="text"
                        className="w-full p-2 rounded border border-neutral/30 bg-base"
                        value={collection.name}
                        onChange={e => handleUpdateCollection(index, { name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">新闻源（1-3 个）</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3 rounded border border-neutral/30 bg-base max-h-48 overflow-y-auto">
                        {availableSources.map(s => (
                          <label key={s.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={collection.sources.includes(s.id)}
                              onChange={(e) => {
                                const newSources = e.target.checked
                                  ? [...collection.sources, s.id].slice(0, 3) // 最多 3 个
                                  : collection.sources.filter(id => id !== s.id)
                                handleUpdateCollection(index, { sources: newSources })
                              }}
                              disabled={!collection.sources.includes(s.id) && collection.sources.length >= 3}
                            />
                            <span className="truncate">
                              {s.name}
                              {s.title ? ` - ${s.title}` : ""}
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        已选择
                        {" "}
                        {collection.sources.length}
                        /3 个源
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {config.collections.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              暂无集合配置，点击上方按钮添加
            </div>
          )}
        </div>
      )}

      {/* 节目单 */}
      {activeTab === "programs" && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">节目单</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn px-3 py-1.5 rounded text-sm bg-blue-100 text-blue-800"
                onClick={() => handleAddProgram("news")}
              >
                + 新闻
              </button>
              <button
                type="button"
                className="btn px-3 py-1.5 rounded text-sm bg-green-100 text-green-800"
                onClick={() => handleAddProgram("collection")}
                disabled={config.collections.length === 0}
              >
                + 集合
              </button>
              <button
                type="button"
                className="btn px-3 py-1.5 rounded text-sm bg-purple-100 text-purple-800"
                onClick={() => handleAddProgram("summary")}
                disabled={config.summaries.length === 0}
              >
                + 汇总
              </button>
              <button
                type="button"
                className="btn px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-800"
                onClick={() => handleAddProgram("break")}
              >
                + 休息
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {config.programs.map((program, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border transition-colors ${
                  editingProgramIndex === index
                    ? "border-primary bg-primary/5"
                    : "border-neutral/20 bg-base hover:border-neutral/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-500 w-8">{index + 1}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      program.type === "news"
                        ? "bg-blue-100 text-blue-800"
                        : program.type === "collection"
                          ? "bg-green-100 text-green-800"
                          : program.type === "summary"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-800"
                    }`}
                    >
                      {program.type === "news" ? "新闻" : program.type === "collection" ? "集合" : program.type === "summary" ? "汇总" : "休息"}
                    </span>
                    <span className="font-medium">
                      {program.type === "news"
                        ? (program.sourceId
                            ? `${sources[program.sourceId]?.name || ""}${sources[program.sourceId]?.title ? ` - ${sources[program.sourceId].title}` : ""}` || program.sourceId
                            : "未选择源")
                        : program.type === "collection"
                          ? getCollectionName(program.collectionId)
                          : program.type === "summary"
                            ? getSummaryName(program.summaryId)
                            : program.label || "休息"}
                    </span>
                    <span className="text-sm text-neutral-500">
                      {program.duration}
                      秒
                    </span>
                    {(program.type === "news" || program.type === "collection") && program.columns && program.columns > 1 && (
                      <span className="text-xs text-neutral-400">
                        {program.columns}
                        {" "}
                        列
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-neutral/10 hover:bg-neutral/20"
                      onClick={() => handleMoveProgram(index, "up")}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-neutral/10 hover:bg-neutral/20"
                      onClick={() => handleMoveProgram(index, "down")}
                      disabled={index === config.programs.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-neutral/10 hover:bg-neutral/20"
                      onClick={() => setEditingProgramIndex(editingProgramIndex === index ? null : index)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200 text-red-600"
                      onClick={() => handleDeleteProgram(index)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* 编辑面板 */}
                {editingProgramIndex === index && (
                  <div className="mt-4 pt-4 border-t border-neutral/20 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 新闻源选择（仅新闻类型） */}
                    {program.type === "news" && (
                      <div>
                        <label className="block text-sm font-medium mb-2">新闻源</label>
                        <select
                          className="w-full p-2 rounded border border-neutral/30 bg-base"
                          value={program.sourceId || ""}
                          onChange={(e) => {
                            const sourceId = e.target.value as SourceID
                            const source = sources[sourceId]
                            handleUpdateProgram(index, {
                              sourceId,
                              label: `${source?.name || ""}${source?.title ? ` - ${source.title}` : ""}` || sourceId,
                            })
                          }}
                        >
                          {availableSources.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                              {s.title ? ` - ${s.title}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 集合选择（仅集合类型） */}
                    {program.type === "collection" && (
                      <div>
                        <label className="block text-sm font-medium mb-2">选择集合</label>
                        <select
                          className="w-full p-2 rounded border border-neutral/30 bg-base"
                          value={program.collectionId || ""}
                          onChange={e => {
                            const collectionId = e.target.value
                            const collection = config.collections.find(c => c.id === collectionId)
                            handleUpdateProgram(index, {
                              collectionId,
                              label: collection?.name || "集合",
                            })
                          }}
                        >
                          {config.collections.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {" "}
                              (
                              {c.sources.length}
                              {" "}
                              个源)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 汇总选择（仅汇总类型） */}
                    {program.type === "summary" && (
                      <div>
                        <label className="block text-sm font-medium mb-2">选择汇总</label>
                        <select
                          className="w-full p-2 rounded border border-neutral/30 bg-base"
                          value={program.summaryId || ""}
                          onChange={e => {
                            const summaryId = e.target.value
                            const summary = config.summaries.find(s => s.id === summaryId)
                            handleUpdateProgram(index, {
                              summaryId,
                              label: summary?.name || "汇总",
                            })
                          }}
                        >
                          {config.summaries.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium mb-2">时长（秒）</label>
                      <input
                        type="number"
                        className="w-full p-2 rounded border border-neutral/30 bg-base"
                        value={program.duration}
                        onChange={e => handleUpdateProgram(index, { duration: Number(e.target.value) })}
                        min={1}
                      />
                    </div>

                    {/* 列数设置（仅新闻类型，集合列数由源数量决定） */}
                    {program.type === "news" && (
                      <div>
                        <label className="block text-sm font-medium mb-2">列数</label>
                        <select
                          className="w-full p-2 rounded border border-neutral/30 bg-base"
                          value={program.columns || 1}
                          onChange={e => handleUpdateProgram(index, { columns: Number(e.target.value) })}
                        >
                          <option value={1}>1 列</option>
                          <option value={2}>2 列</option>
                          <option value={3}>3 列</option>
                        </select>
                      </div>
                    )}

                    {/* TTS 设置 */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={program.tts ?? false}
                          onChange={e => handleUpdateProgram(index, { tts: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm font-medium">启用 TTS 语音播报</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {config.programs.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              暂无节目，点击上方按钮添加
            </div>
          )}
        </div>
      )}

      {/* 背景音乐 */}
      {activeTab === "bgm" && (
        <PlaylistEditor />
      )}

      {/* 预览 */}
      <div className="p-4 rounded-lg bg-base border border-neutral/20">
        <h2 className="text-lg font-bold mb-4">预览</h2>
        <div className="flex flex-wrap gap-2">
          {config.programs.map((program, index) => (
            <div
              key={index}
              className={`px-3 py-1.5 rounded text-sm ${
                program.type === "news"
                  ? "bg-blue-100 text-blue-800"
                  : program.type === "summary"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-800"
              }`}
            >
              {program.type === "news"
                ? (program.sourceId ? sources[program.sourceId]?.name : "新闻")
                : program.type === "summary"
                  ? getSummaryName(program.summaryId)
                  : "休息"}
              <span className="ml-1 text-xs opacity-70">
                {program.duration}
                s
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-neutral-500">
          总时长:
          {" "}
          {Math.floor(config.programs.reduce((sum, p) => sum + p.duration, 0) / 60)}
          分
          {config.programs.reduce((sum, p) => sum + p.duration, 0) % 60}
          秒
        </div>
      </div>
    </div>
  )
}

// 播放列表编辑器组件
function PlaylistEditor() {
  const queryClient = useQueryClient()

  // 加载播放列表配置
  const { data: playlistConfig, isLoading } = useQuery<PlaylistConfig>({
    queryKey: ["playlist-config"],
    queryFn: async () => await myFetch("/playlist"),
  })

  // 加载可用音轨
  const { data: availableTracks } = useQuery<Track[]>({
    queryKey: ["playlist-tracks"],
    queryFn: async () => await myFetch("/playlist/tracks"),
  })

  // 保存播放列表
  const saveMutation = useMutation({
    mutationFn: async (config: PlaylistConfig) => {
      return await myFetch("/playlist", {
        method: "POST",
        body: config,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist-config"] })
    },
  })

  const [config, setConfig] = useState<PlaylistConfig>({
    enabled: false,
    volume: 0.3,
    tracks: [],
  })

  useEffect(() => {
    if (playlistConfig && availableTracks) {
      // 过滤掉不存在的文件
      const validUrls = new Set(availableTracks.map(t => t.url))
      const validTracks = playlistConfig.tracks.filter(t => validUrls.has(t))
      setConfig({
        ...playlistConfig,
        tracks: validTracks,
      })
    } else if (playlistConfig) {
      setConfig(playlistConfig)
    }
  }, [playlistConfig, availableTracks])

  const handleSave = () => {
    saveMutation.mutate(config)
  }

  const handleToggleTrack = (url: string) => {
    setConfig(prev => ({
      ...prev,
      tracks: prev.tracks.includes(url)
        ? prev.tracks.filter(t => t !== url)
        : [...prev.tracks, url],
    }))
  }

  if (isLoading) {
    return <div className="text-center py-8 text-neutral-500">加载中...</div>
  }

  return (
    <div className="mb-6 p-4 rounded-lg bg-base border border-neutral/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">背景音乐设置</h2>
        <button
          type="button"
          className="btn px-4 py-2 rounded-lg bg-primary text-white"
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "保存中..." : "保存"}
        </button>
      </div>

      {saveMutation.isSuccess && (
        <div className="mb-4 p-3 rounded-lg bg-green-100 text-green-800">
          保存成功！
        </div>
      )}

      <div className="space-y-4">
        {/* 启用开关 */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig({ ...config, enabled: e.target.checked })}
            />
            <span className="text-sm font-medium">启用背景音乐</span>
          </label>
        </div>

        {/* 音量控制 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            音量:
            {" "}
            {Math.round(config.volume * 100)}
            %
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.volume}
            onChange={e => setConfig({ ...config, volume: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* 音轨列表 */}
        <div>
          <label className="block text-sm font-medium mb-2">选择音乐文件</label>
          {availableTracks && availableTracks.length > 0
            ? (
                <div className="space-y-2">
                  {availableTracks.map(track => (
                    <label
                      key={track.filename}
                      className="flex items-center gap-2 p-2 rounded-lg border border-neutral/20 hover:bg-neutral/5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={config.tracks.includes(track.url)}
                        onChange={() => handleToggleTrack(track.url)}
                      />
                      <span className="text-sm">{track.name}</span>
                    </label>
                  ))}
                </div>
              )
            : (
                <p className="text-sm text-neutral-500">
                  暂无音乐文件，请将 mp3 文件放入 data 目录
                </p>
              )}
        </div>
      </div>
    </div>
  )
}
