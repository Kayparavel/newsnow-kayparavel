const hot = defineSource(async () => {
  const res = await myFetch("https://linux.do/top/daily.json")
  return res.topic_list.topics
    .filter((k: any) => k.visible && !k.archived && !k.pinned)
    .map((k: any) => ({
      id: k.id,
      title: k.title,
      url: `https://linux.do/t/topic/${k.id}`,
    }))
})

const latest = defineSource(async () => {
  const res = await myFetch("https://linux.do/latest.json?order=created")
  return res.topic_list.topics
    .filter((k: any) => k.visible && !k.archived && !k.pinned)
    .map((k: any) => ({
      id: k.id,
      title: k.title,
      pubDate: new Date(k.created_at).valueOf(),
      url: `https://linux.do/t/topic/${k.id}`,
    }))
})

export default defineSource({
  "linuxdo": latest,
  "linuxdo-latest": latest,
  "linuxdo-hot": hot,
})
