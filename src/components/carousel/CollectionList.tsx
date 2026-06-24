import type { NewsItem, SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { relativeTime } from "@shared/utils"

const ITEMS_PER_COLUMN = 10 // 每列显示新闻数量

// 列数对应的 CSS 类
const columnClassMap: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
}

interface SourceData {
  sourceId: SourceID
  items: NewsItem[]
}

interface CollectionListProps {
  sourcesData: SourceData[]
}

// 集合列表组件（用于多源集合，每个源一列，显示源标题）
export function CollectionList({ sourcesData }: CollectionListProps) {
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
