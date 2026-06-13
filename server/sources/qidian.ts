import * as cheerio from "cheerio"
import { myScrapingFetch } from "#/utils/fetch"

/*
 * 排行榜列表（m.qidian.com/rank/）:
 *   月票榜     /rank/yuepiao/
 *   畅销榜     /rank/changxiao/
 *   阅读指数榜 /rank/readIndex/
 *   推荐榜     /rank/recom/
 *   收藏榜     /rank/collect/
 *   更新榜     /rank/update/
 *   新书榜     /rank/signnew/
 *   留言榜     /rank/review/
 */

const qidian = defineSource(async () => {
  logger.info("[qidian] Fetching qidian rank...")
  const response = await myScrapingFetch("https://m.qidian.com/rank/yuepiao/", {
    headers: {
      referer: "https://m.qidian.com/",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: { request: 15000 },
  })

  logger.info("[qidian] Response status:", response.statusCode)
  logger.info("[qidian] Response body length:", (response.body as string)?.length)
  logger.info("[qidian] Response body preview:", (response.body as string)?.substring(0, 500))

  const $ = cheerio.load(response.body as string)
  const news: NewsItem[] = []

  const bookLinks = "a[href*='/book/']"
  const bookLinksCount = $(bookLinks).length
  logger.info("[qidian] Found book links:", bookLinksCount)

  $(bookLinks).each((i, el) => {
    const $a = $(el)
    const href = $a.attr("href") || ""
    const titleAttr = $a.attr("title") || ""

    const bookIdMatch = href.match(/\/book\/(\d+)/)
    if (!bookIdMatch) return

    const bookId = bookIdMatch[1]
    const url = `https://www.qidian.com/book/${bookId}/`

    const titleText = $a.text().trim()
    const nameMatch = titleAttr.replace(/最新章节在线阅读$/, "").trim()
    const ticketMatch = titleText.match(/(\d[\d.]*万?月票)/)
    const ticket = ticketMatch ? ticketMatch[1] : ""

    const title = nameMatch || titleText.replace(/^\d+/, "").replace(/\d+万月票.*/, "").trim()

    logger.info(`[qidian] Book ${i + 1}: ${title} (${bookId})`)

    news.push({
      id: bookId,
      title,
      url,
      extra: {
        info: `${ticket}`,
      },
    })
  })

  logger.info(`[qidian] Total books found: ${news.length}`)
  return news
})

export default defineSource({
  qidian,
})
