import type { SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { useQueryClient } from "@tanstack/react-query"

export function useRefetch() {
  const { enableLogin, loggedIn, login } = useLogin()
  const toaster = useToast()
  const queryClient = useQueryClient()
  /**
   * force refresh
   */
  const refresh = useCallback(async (...sourceIds: SourceID[]) => {
    console.log('useRefetch called with sources:', sourceIds)
    console.log('Current loggedIn status:', loggedIn)
    if (enableLogin && !loggedIn) {
      console.log('Showing login toast')
      toaster("登录后可以强制拉取最新数据", {
        type: "warning",
        action: {
          label: "登录",
          onClick: login,
        },
      })
    } else {
      // 分开需要错开的源和普通源
      const staggerSources: SourceID[] = []
      const normalSources: SourceID[] = []
      for (const id of sourceIds) {
        if (sources[id]?.staggerRefresh) {
          staggerSources.push(id)
        } else {
          normalSources.push(id)
        }
      }
      
      // 普通源并发刷新
      if (normalSources.length > 0) {
        console.log('Refreshing normal sources:', normalSources)
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
        console.log('Refreshing stagger source:', id)
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
    }
  }, [loggedIn, toaster, login, enableLogin, queryClient])

  return {
    refresh,
    refetchSources,
  }
}
