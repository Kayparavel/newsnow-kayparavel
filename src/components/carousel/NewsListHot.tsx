import type { NewsItem } from "@shared/types"

interface NewsListHotProps {
  items: NewsItem[]
  columns?: number
}

// 列数对应的 CSS 类
const columnClassMap: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
}

// 最热类新闻列表（显示序号 + 排名变化）
export function NewsListHot({ items, columns = 1 }: NewsListHotProps) {
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
                    <span className="absolute -top-1 -right-2 text-[10px] text-red font-bold">
                      +
                      {diff}
                    </span>
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
