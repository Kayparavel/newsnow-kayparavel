import type { SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { useQueryClient } from "@tanstack/react-query"

// 译文源 ID 后缀
const TRANSLATED_SUFFIX = "-zh"

// 判断是否是译文源
function isTranslatedSource(id: SourceID): boolean {
  return id.endsWith(TRANSLATED_SUFFIX)
}

export function useRefetch() {
  const { enableLogin, loggedIn, login } = useLogin()
  const toaster = useToast()
  const queryClient = useQueryClient()
  /**
   * force refresh
   */
  const refresh = useCallback(async (...sourceIds: SourceID[]) => {
    console.log("useRefetch called with sources:", sourceIds)
    console.log("Current loggedIn status:", loggedIn)
    if (enableLogin && !loggedIn) {
      console.log("Showing login toast")
      toaster("登录后可以强制拉取最新数据", {
        type: "warning",
        action: {
          label: "登录",
          onClick: login,
        },
      })
    } else {
      // 分离译文源和原文源
      const translatedSources: SourceID[] = []
      const originalSources: SourceID[] = []
      for (const id of sourceIds) {
        if (isTranslatedSource(id)) {
          translatedSources.push(id)
          // 通过 dependsOn 字段获取原文源 ID
          const originalId = sources[id]?.dependsOn
          if (originalId && !originalSources.includes(originalId)) {
            originalSources.push(originalId)
          }
        } else {
          originalSources.push(id)
        }
      }

      // 分开需要错开的源和普通源（原文源）
      const staggerSources: SourceID[] = []
      const normalSources: SourceID[] = []
      for (const id of originalSources) {
        if (sources[id]?.staggerRefresh) {
          staggerSources.push(id)
        } else {
          normalSources.push(id)
        }
      }

      // 第一轮：刷新原文源
      // 普通源并发刷新
      if (normalSources.length > 0) {
        console.log("Refreshing normal sources:", normalSources)
        refetchSources.clear()
        normalSources.forEach(id => refetchSources.add(id))
        await queryClient.refetchQueries({
          predicate: (query) => {
            const [type, id] = query.queryKey as ["source" | "entire", SourceID]
            return type === "source" && normalSources.includes(id)
          },
        })
      }

      // 需要错开的源顺序刷新，每个间隔 1秒
      for (const id of staggerSources) {
        console.log("Refreshing stagger source:", id)
        refetchSources.clear()
        refetchSources.add(id)
        await queryClient.refetchQueries({
          predicate: (query) => {
            const [type, queryId] = query.queryKey as ["source" | "entire", SourceID]
            return type === "source" && queryId === id
          },
        })
        await new Promise(r => setTimeout(r, 1000))
      }

      // 第二轮：刷新译文源（此时原文源缓存已是最新）
      if (translatedSources.length > 0) {
        console.log("Refreshing translated sources:", translatedSources)
        // 等待一小段时间确保原文源缓存已更新
        await new Promise(r => setTimeout(r, 500))
        refetchSources.clear()
        translatedSources.forEach(id => refetchSources.add(id))
        await queryClient.refetchQueries({
          predicate: (query) => {
            const [type, id] = query.queryKey as ["source" | "entire", SourceID]
            return type === "source" && translatedSources.includes(id)
          },
        })
      }
    }
  }, [loggedIn, toaster, login, enableLogin, queryClient])

  return {
    refresh,
    refetchSources,
  }
}
