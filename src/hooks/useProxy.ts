import type { SourceID } from "@shared/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { myFetch } from "~/utils"

export function useProxyConfig(id: SourceID) {
  const queryClient = useQueryClient()

  const { data: useProxy, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["proxy", id],
    queryFn: async () => {
      const res = await myFetch("/source-proxy", {
        query: { id },
      })
      return res.useProxy ?? false
    },
    staleTime: Infinity,
  })

  const { mutate: _setProxy, isPending, isError } = useMutation({
    mutationFn: async (newValue: boolean) => {
      const headers: Record<string, any> = {}
      const jwt = safeParseString(localStorage.getItem("jwt"))
      if (jwt) headers.Authorization = `Bearer ${jwt}`
      await myFetch("/source-proxy", {
        method: "POST",
        body: { id, useProxy: newValue },
        headers,
        timeout: 1000,
      })
      return newValue
    },
    onMutate: async (newValue) => {
      await queryClient.cancelQueries({ queryKey: ["proxy", id] })
      const previousValue = queryClient.getQueryData(["proxy", id])
      queryClient.setQueryData(["proxy", id], newValue)
      return { previousValue }
    },
    onError: (_err, _newValue, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(["proxy", id], context.previousValue)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["proxy", id] })
    },
  })

  const setProxy = useCallback(
    (newValue: boolean, options?: { onError?: () => void }) => {
      _setProxy(newValue, {
        onError: options?.onError,
      })
    },
    [_setProxy],
  )

  const toggleProxy = useCallback(
    (options?: { onError?: () => void }) => {
      if (isPending) return
      setProxy(!useProxy, options)
    },
    [isPending, setProxy, useProxy],
  )

  return {
    useProxy: useProxy ?? false,
    isLoading: isLoadingConfig,
    isPending,
    isError,
    toggleProxy,
    setProxy,
  }
}
