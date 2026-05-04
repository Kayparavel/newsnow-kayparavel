import { myScrapingFetch } from "#/utils/fetch"

async function fetchReutersSection(sectionPath: string): Promise<NewsItem[]> {
  const url = `https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-alias-or-id-v1?query={%22arc-site%22:%22reuters%22,%22fetch_type%22:%22collection%22,%22offset%22:0,%22section_id%22:%22${sectionPath}%22,%22size%22:20,%22website%22:%22reuters%22}`
  const response = await myScrapingFetch(url, { responseType: "json", timeout: { request: 15000 } })
  logger.info("[reuters] status:", response.statusCode)
  logger.info("[reuters] resolved ip:", response.ip)
  const data = response.body as any
  const articles = data.result.articles || []

  return articles.map((item: any): NewsItem => {
    return {
      id: item.id,
      title: item.title,
      url: `https://www.reuters.com${item.canonical_url}`,
      pubDate: new Date(item.display_time).getTime(),
      extra: {
        info: item.kicker?.name || "",
        hover: item.description || "",
      },
    }
  }).sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
}

export default defineSource({
  "reuters-world": () => fetchReutersSection("/world/"),
  "reuters-business": () => fetchReutersSection("/business/"),
  "reuters-tech": () => fetchReutersSection("/technology/"),
  "reuters-world-googlerss": async () => {
    const data = await rss2json("https://news.google.com/rss/search?q=site:reuters.com+world&hl=en")
    if (!data?.items.length) throw new Error("Cannot fetch rss data")
    return data.items.map(item => ({
      title: (item.title || "").replace(/ - Reuters$/, ""),
      url: item.link,
      id: item.link,
      pubDate: item.created ? new Date(item.created).getTime() : undefined,
    }))
      .sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
  },
})
