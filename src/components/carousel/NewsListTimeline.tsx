import type { NewsItem } from "@shared/types"
import { relativeTime } from "@shared/utils"

interface NewsListTimelineProps {
  items: NewsItem[]
  columns?: number
}

// 列数对应的 CSS 类
const columnClassMap: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
}

// 实时类新闻列表（显示时间 + 新增标红）
export function NewsListTimeline({ items, columns = 1 }: NewsListTimelineProps) {
  const itemsPerColumn = Math.ceil(items.length / columns)
  const gridClass = columnClassMap[columns] || "grid-cols-1"

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex} className="space-y-1">
          {items.slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn).map((item) => {
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
