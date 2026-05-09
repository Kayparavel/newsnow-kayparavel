import * as cheerio from "cheerio"

interface BbcArticle {
  title: string
  href: string
  description?: string
  metadata?: {
    lastUpdated?: number
  }
}

const bbc = defineSource(async () => {
  const html = await myFetch("https://www.bbc.com/news") as string
  const $ = cheerio.load(html)
  const news: NewsItem[] = []
  const seen = new Set<string>()

  const script = $("script#__NEXT_DATA__").html()
  if (!script) throw new Error("[bbc] __NEXT_DATA__ not found")

  const data = JSON.parse(script)
  const pageProps = data?.props?.pageProps
  const page = pageProps?.page
  const pageKey = Object.keys(page || {})[0]
  logger.info("[bbc] page keys:", Object.keys(page || {}))

  const pageData = page?.[pageKey]
  logger.info("[bbc] pageData keys:", Object.keys(pageData || {}))

  const sections: any[] = pageData?.sections || []
  logger.info("[bbc] sections count:", sections.length)

  let totalItems = 0
  for (const section of sections) {
    const content: BbcArticle[] = section?.content || []
    for (const item of content) {
      if (!item.title || !item.href) continue
      if (seen.has(item.href)) continue
      seen.add(item.href)

      const url = `https://www.bbc.com${item.href}`
      const pubDate = item.metadata?.lastUpdated

      news.push({
        id: item.href,
        title: item.title,
        url,
        pubDate,
        extra: {
          hover: item.description,
        },
      })
      totalItems++
    }
  }

  logger.info("[bbc] parsed items:", totalItems)

  news.sort((a, b) => {
    const da = typeof a.pubDate === "number" ? a.pubDate : 0
    const db = typeof b.pubDate === "number" ? b.pubDate : 0
    return db - da
  })

  return news
})

export default defineSource({
  bbc,
})
