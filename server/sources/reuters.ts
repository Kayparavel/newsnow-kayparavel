import process from "node:process"
import { gotScraping } from "got-scraping"
import { useProxyStorage } from "#/utils/fetch"

const proxyEnvKeys = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "PROXY", "proxy"] as const

async function reutersFetch(url: string) {
  const useProxy = useProxyStorage.getStore() ?? false
  logger.info(`[reuters] useProxy: ${useProxy}`)

  const options = {
    url,
    responseType: "json" as const,
    timeout: { request: 15000 },
    http2: false,
  }

  if (!useProxy) {
    const saved = proxyEnvKeys.map(k => [k, process.env[k]] as const)
    proxyEnvKeys.forEach(k => delete process.env[k])
    try {
      return await gotScraping(options)
    } finally {
      saved.forEach(([k, v]) => {
        if (v) process.env[k] = v
      })
    }
  }

  return await gotScraping(options)
}

export default defineSource({
  "reuters-world": async () => {
    const url = `https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-alias-or-id-v1?query={%22arc-site%22:%22reuters%22,%22fetch_type%22:%22collection%22,%22offset%22:0,%22requestId%22:1,%22section_id%22:%22/world/%22,%22size%22:%2230%22,%22uri%22:%22/world/%22,%22website%22:%22reuters%22}&d=361&mxId=00000000&_website=reuters`
    const response = await reutersFetch(url)
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
  },
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
