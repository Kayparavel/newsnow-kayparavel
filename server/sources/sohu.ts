import * as cheerio from "cheerio"

const sohu = defineSource(async () => {
  const html = await myFetch("https://news.sohu.com/") as string
  const $ = cheerio.load(html)
  const news: NewsItem[] = []
  const seen = new Set<string>()

  const cleanUrl = (raw: string) => {
    let u = raw.trim()
    if (u.startsWith("//")) u = `https:${u}`
    return u.split("?")[0]
  }

  const addNews = (title: string, href: string) => {
    title = title.replace(/\s+/g, " ").trim()
    if (!title || title === "|" || !href) return
    const url = cleanUrl(href)
    if (seen.has(url)) return
    seen.add(url)
    news.push({
      id: url.replace("https://www.sohu.com", ""),
      title,
      url,
    })
  }

  const $block = $("#block4")

  $block.find(".text-chain-item").each((_, el) => {
    const $el = $(el)
    const title = $el.find(".text-info").text()
    const href = $el.attr("href") || ""
    addNews(title, href)
  })

  $block.find("a.multiple-text").each((_, el) => {
    const $el = $(el)
    const title = $el.text()
    const href = $el.attr("href") || ""
    addNews(title, href)
  })

  return news
})

export default defineSource({
  sohu,
})
