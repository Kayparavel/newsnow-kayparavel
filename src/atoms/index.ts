import type { FixedColumnID, SourceID } from "@shared/types"
import type { Update } from "./types"

// 页面 ID 类型，包含固定栏目和轮播
export type PageID = FixedColumnID | "carousel"

export const focusSourcesAtom = atom((get) => {
  return get(primitiveMetadataAtom).data.focus
}, (get, set, update: Update<SourceID[]>) => {
  const _ = update instanceof Function ? update(get(focusSourcesAtom)) : update
  set(primitiveMetadataAtom, {
    updatedTime: Date.now(),
    action: "manual",
    data: {
      ...get(primitiveMetadataAtom).data,
      focus: _,
    },
  })
})

export const currentColumnIDAtom = atom<PageID>("focus")

export const currentSourcesAtom = atom((get) => {
  const id = get(currentColumnIDAtom)
  // carousel 页面没有对应的 sources，返回空数组
  if (id === "carousel") return [] as SourceID[]
  return get(primitiveMetadataAtom).data[id]
}, (get, set, update: Update<SourceID[]>) => {
  const id = get(currentColumnIDAtom)
  // carousel 页面不更新 sources
  if (id === "carousel") return
  const _ = update instanceof Function ? update(get(currentSourcesAtom)) : update
  set(primitiveMetadataAtom, {
    updatedTime: Date.now(),
    action: "manual",
    data: {
      ...get(primitiveMetadataAtom).data,
      [id]: _,
    },
  })
})

export const goToTopAtom = atom({
  ok: false,
  el: undefined as HTMLElement | undefined,
  fn: undefined as (() => void) | undefined,
})
