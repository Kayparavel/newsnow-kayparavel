import type { NewsItem } from "@shared/types"

interface JiemianNewsItem {
  id: string
  publishtime: string
  title: string
  summary: string
  weights: string
  h5_href: string
  is_original: string
  is_make_img: string
  img_urls: any[]
  edit_cms: number
  blackwhite: string
}

interface JiemianResponse {
  code: string
  message: string
  user_status: {
    status: number
    title: string
    content: string
  }
  result: {
    hideBtn: boolean
    list: JiemianNewsItem[]
  }
}

// 通用的界面新闻获取函数
async function fetchJiemianNews(cid: string, tagid: string): Promise<NewsItem[]> {
  const timestamp = Math.floor(Date.now() / 1000) - 5 // 当前Unix时间戳减5秒（秒）
  const apiUrl = `https://papi.jiemian.com/page/api/kuaixun/getlistmore?cid=${cid}&start_time=${timestamp}&page=1&tagid=${tagid}`

  const res: JiemianResponse = await myFetch(apiUrl)

  if (res.code === "0" && res.result?.list) {
    return res.result.list.map((item) => {
      const pubDate = Number.parseInt(item.publishtime) * 1000

      return {
        id: item.id,
        title: item.title,
        url: `https://www.jiemian.com/article/${item.id}.html`, // 使用id构建文章链接
        pubDate,
        extra: {
          hover: item.summary,
          date: pubDate,
        },
      }
    })
  }

  return []
}

// 今日热点
const todayHot = defineSource(async () => {
  return await fetchJiemianNews("1324kb", "1324")
})

// 公司头条
const companyNews = defineSource(async () => {
  return await fetchJiemianNews("1322kb", "1322")
})

// 股市前沿
const stockMarket = defineSource(async () => {
  return await fetchJiemianNews("1327kb", "1327")
})

// 监管通报
const regulatoryNews = defineSource(async () => {
  return await fetchJiemianNews("1330kb", "1330")
})

// 财经速览
const financeNews = defineSource(async () => {
  return await fetchJiemianNews("1326kb", "1326")
})

// 时事追踪
const currentAffairs = defineSource(async () => {
  return await fetchJiemianNews("1325kb", "1325")
})

// 即时资讯（原快讯板块）
const quickNews = defineSource(async () => {
  return await fetchJiemianNews("1323kb", "1323")
})

export default defineSource({
  "jiemian": quickNews, // 默认源
  "jiemian-quick": quickNews, // 即时资讯
  "jiemian-todayhot": todayHot, // 今日热点
  "jiemian-company": companyNews, // 公司头条
  "jiemian-stock": stockMarket, // 股市前沿
  "jiemian-regulatory": regulatoryNews, // 监管通报
  "jiemian-finance": financeNews, // 财经速览
  "jiemian-affairs": currentAffairs, // 时事追踪
})
