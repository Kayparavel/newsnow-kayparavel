import * as cheerio from "cheerio"

const apnews = defineSource(async () => {
  const html = await myFetch("https://apnews.com/world-news") as string
  const $ = cheerio.load(html)
  const news: NewsItem[] = []
  const seen = new Set<string>()

  $("div.PagePromo").each((_, el) => {
    const $el = $(el)
    const $a = $el.find(".PagePromo-title a.Link")
    const href = $a.attr("href") || ""
    if (!href) return

    const title = $el.find(".PagePromoContentIcons-text").text().trim()
    if (!title || seen.has(href)) return
    seen.add(href)

    const url = href.startsWith("/") ? `https://apnews.com${href}` : href
    const ts = $el.attr("data-posted-date-timestamp")
      || $el.attr("data-updated-date-timestamp")

    news.push({
      id: url.replace("https://apnews.com", ""),
      title,
      url,
      pubDate: ts ? Number(ts) : undefined,
    })
  })

  news.sort((a, b) => {
    const da = typeof a.pubDate === "number" ? a.pubDate : 0
    const db = typeof b.pubDate === "number" ? b.pubDate : 0
    return db - da
  })

  return news
})

export default defineSource({
  apnews,
})
