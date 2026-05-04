import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import https from "node:https"
import type { NewsItem } from "@shared/types"
import { load } from "cheerio"
import dayjs from "dayjs/esm"
import { logger } from "#/utils/logger"

async function fetch36kr(url: string): Promise<string> {
  let body = await myFetch(url) as string
  if (!body.includes("_wafchallengeid")) return body
  logger.info("[36kr] PoW challenge detected, solving...")
  const match = body.match(/atob\('([^']+)'\)/)
  if (!match) throw new Error("[36kr] Failed to extract PoW challenge")
  const data = JSON.parse(Buffer.from(match[1], "base64").toString())
  const key = Buffer.from(data.v.a, "base64")
  const target = Buffer.from(data.v.c, "base64").toString("hex")
  let solved = false
  for (let i = 0; i <= 2000000; i++) {
    const hash = createHash("sha256").update(key).update(String(i)).digest("hex")
    if (hash === target) {
      data.d = Buffer.from(String(i)).toString("base64")
      solved = true
      break
    }
  }
  if (!solved) throw new Error("[36kr] PoW solve failed")
  const challengeCookie = `_wafchallengeid=${Buffer.from(JSON.stringify(data)).toString("base64")}`
  const u = new URL(url)
  const tokenCookie: string = await new Promise((resolve, reject) => {
    https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        "Cookie": challengeCookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
    }, (res) => {
      res.resume()
      const raw = res.headers["set-cookie"] || []
      resolve((Array.isArray(raw) ? raw : [raw]).map(c => c.split(";")[0]).join("; "))
    }).on("error", reject).end()
  })
  const allCookies = [challengeCookie, tokenCookie].filter(Boolean).join("; ")
  body = await myFetch(url, { headers: { Cookie: allCookies } }) as string
  if (body.includes("_wafchallengeid")) throw new Error("[36kr] Still blocked after PoW")
  return body
}

const quick = defineSource(async () => {
  const baseURL = "https://www.36kr.com"
  const url = `${baseURL}/newsflashes`
  const response = await myFetch(url) as any
  const $ = load(response)
  const news: NewsItem[] = []
  const $items = $(".newsflash-item")
  $items.each((_, el) => {
    const $el = $(el)
    const $a = $el.find("a.item-title")
    const url = $a.attr("href")
    const title = $a.text()
    const relativeDate = $el.find(".time").text()
    if (url && title && relativeDate) {
      news.push({
        url: `${baseURL}${url}`,
        title,
        id: url,
        extra: {
          date: parseRelativeDate(relativeDate, "Asia/Shanghai").valueOf(),
        },
      })
    }
  })

  return news
})

const renqi = defineSource(async () => {
  const baseURL = "https://www.36kr.com"
  const formatted = dayjs().format("YYYY-MM-DD")
  const url = `${baseURL}/hot-list/renqi/${formatted}/1`

  const response = await fetch36kr(url)
  const body = response

  const $ = load(body)
  const articles: NewsItem[] = []

  const $items = $(".article-item-info")

  $items.each((_, el) => {
    const $el = $(el)

    const $a = $el.find("a.article-item-title.weight-bold")
    const href = $a.attr("href") || ""
    const title = $a.text().trim()

    const description = $el.find("a.article-item-description.ellipsis-2").text().trim()
    const author = $el.find(".kr-flow-bar-author").text().trim()
    const hot = $el.find(".kr-flow-bar-hot span").text().trim()

    if (href && title) {
      articles.push({
        url: href.startsWith("http") ? href : `${baseURL}${href}`,
        title,
        id: href.slice(3),
        extra: {
          info: `${author}  |  ${hot}`,
          hover: description,
        },
      })
    }
  })
  return articles
})

export default defineSource({
  "36kr": quick,
  "36kr-quick": quick,
  "36kr-renqi": renqi,
})
