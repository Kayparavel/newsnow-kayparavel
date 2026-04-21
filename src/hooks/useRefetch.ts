import type { SourceID } from "@shared/types"
import { useUpdateQuery } from "./query"

export function useRefetch() {
  const { enableLogin, loggedIn, login } = useLogin()
  const toaster = useToast()
  const updateQuery = useUpdateQuery()
  /**
   * force refresh
   */
  const refresh = useCallback((...sources: SourceID[]) => {
    console.log('useRefetch called with sources:', sources)
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
      console.log('Clearing and adding to refetchSources:', sources)
      refetchSources.clear()
      sources.forEach(id => {
        refetchSources.add(id)
        console.log('Added', id, 'to refetchSources')
      })
      console.log('Calling updateQuery')
      updateQuery(...sources)
    }
  }, [loggedIn, toaster, login, enableLogin, updateQuery])

  return {
    refresh,
    refetchSources,
  }
}
