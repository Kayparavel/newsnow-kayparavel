import * as cheerio from "cheerio"

const music163 = defineSource(async () => {
  const html = await myFetch("https://music.163.com/discover/toplist?id=19723756") as string
  const $ = cheerio.load(html)
  const news: NewsItem[] = []

  const $cache = $("#song-list-pre-cache")

  $cache.find("ul.f-hide li a").each((_, el) => {
    const $a = $(el)
    const href = $a.attr("href") || ""
    const title = $a.text().trim()
    if (!title || !href) return

    const url = `https://music.163.com${href}`
    const id = href.replace("/song?id=", "")

    news.push({
      id,
      title,
      url,
    })
  })

  return news
})

export default defineSource({
  music163,
})
