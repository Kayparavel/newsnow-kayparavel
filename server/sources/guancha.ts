import * as cheerio from "cheerio"

const guancha = defineSource(async () => {
  const html = await myFetch("https://www.guancha.cn/") as string
  const $ = cheerio.load(html)
  const news: NewsItem[] = []
  const seen = new Set<string>()

  const addNews = (title: string, href: string, info?: string) => {
    if (!title || !href || seen.has(href)) return
    seen.add(href)
    let url = href
    if (url.startsWith("/")) url = `https://www.guancha.cn${url}`
    const id = url.replace("https://www.guancha.cn", "")
    news.push({ id, title, url, extra: { info } })
  }

  const extractInteract = ($el: cheerio.Cheerio<cheerio.Element>) => {
    const parts: string[] = []
    $el.find("a[data-sensor='阅读数'], a[data-sensor='评论数']").each((_, r) => {
      const t = $(r).text().trim()
      if (t) parts.push(t)
    })
    return parts.length ? parts.join("  ") : undefined
  }

  const $headline = $(".content-headline")
  const $hlA = $headline.find("h3 a")
  const hlTitle = $hlA.text().trim()
  const hlHref = $hlA.attr("href") || ""
  const hlInfo = extractInteract($headline.find("ul.content-headline-other"))
  addNews(hlTitle, hlHref, hlInfo)

  $(".index-content h4.module-title a[data-sensor='标题']").each((_, el) => {
    const $a = $(el)
    const title = $a.text().trim()
    const href = $a.attr("href") || ""
    const $li = $a.closest("li")
    const info = extractInteract($li)
    addNews(title, href, info)
  })

  return news
})

export default defineSource({
  guancha,
})
