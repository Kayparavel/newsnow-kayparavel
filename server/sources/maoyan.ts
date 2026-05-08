import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { myScrapingFetch } from "#/utils/fetch"

interface MovieInfo {
  movieName: string
  movieId: number
  releaseInfo?: string
}

interface MovieItem {
  movieInfo: MovieInfo
  boxRate: string
  showCount: number
  showCountRate: string
  sumBoxDesc: string
  avgShowView: string
}

interface TvShowItem {
  programmeName: string
  channelName: string
  attentionRate: number
  attentionRateDesc: string
  marketRate: number
  marketRateDesc: string
}

interface WebHeatItem {
  currHeat: number
  currHeatDesc: string
  seriesInfo: {
    name: string
    seriesId: number
    releaseInfo?: string
    platformDesc?: string
  }
}

interface DashboardRes {
  movieList: {
    status: boolean
    data: {
      list: MovieItem[]
    }
  }
  tvList: {
    status: boolean
    data: {
      list: TvShowItem[]
    }
  }
  webList: {
    status: boolean
    data: {
      list: WebHeatItem[]
    }
  }
}

// ===== 猫眼数据平台 API 接口 =====
// 猫眼数据平台 (piaofang.maoyan.com) 采用多重反爬策略：
// 1. React SPA，页面无服务端渲染数据，无法通过 HTML 爬取
// 2. 数据通过 /dashboard-ajax 接口获取，该接口需要签名认证
// 3. 数字票房数据使用自定义字体加密（Unicode 私用区编码），无法直接解析
//
// 签名算法逆向自 webpack 打包的前端 JS（largeScreenDashboardIndex_*.js）：
// 将所有签名参数按 key 字母序排列 → 拼接为 key=value& 字符串
// → MD5 哈希生成 signKey → 随请求参数一起发送
// 硬编码的签名密钥：A013F70DB97834C0A5492378BD76C53A

function buildSignedQuery(params: Record<string, any>, channelId: number): Record<string, any> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  // 构造签名所需的参数集
  const o: Record<string, any> = {
    method: "GET",
    timeStamp: Date.now(),
    index: Math.floor(1000 * Math.random() + 1),
    channelId,
    sVersion: 2,
    key: "A013F70DB97834C0A5492378BD76C53A",
  }
  // User-Agent 需要 Base64 编码后作为签名参数的一部分
  o["User-Agent"] = Buffer.from(ua).toString("base64")
  // 按 Object.keys 自然顺序拼接所有参数为 key=value 字符串
  const d = Object.keys(o).reduce((t, e) => {
    return o[e] === 0 || o[e] ? `${t}&${e}=${o[e]}` : `${t}&${e}=''`
  }, "").slice(1)
  // 对拼接字符串做 MD5 哈希，得到签名校验值
  const signKey = createHash("md5").update(d.replace(/\s+/g, " ")).digest("hex")
  // 移除签名专用的参数，只保留业务参数 + 签名结果
  delete o.method
  delete o.key
  o.signKey = signKey
  return { ...params, ...o }
}

// 使用 myScrapingFetch（基于 got-scraping）请求 API，它会模拟真实浏览器指纹，
// 绕过猫眼的 bot 检测（MyH5Guard、WuKong 等反爬机制）
async function fetchMaoyanDashboard(queryParams: Record<string, any>, channelId: number) {
  const query = buildSignedQuery(queryParams, channelId)
  const qs = new URLSearchParams(query as Record<string, string>).toString()
  const url = `https://piaofang.maoyan.com/dashboard-ajax?${qs}`

  const response = await myScrapingFetch(url, {
    headers: {
      // Referer 必须匹配猫眼域名，否则接口会拒绝请求
      Referer: "https://piaofang.maoyan.com/i/dashboard",
      Accept: "application/json, text/plain, */*",
    },
    responseType: "json",
    timeout: { request: 15000 },
  })

  return response.body as unknown as DashboardRes
}

const boxOffice = defineSource(async () => {
  const channelId = 40009
  const res = await fetchMaoyanDashboard({ orderType: 0 }, channelId)

  const list = res?.movieList?.data?.list
  if (!list?.length) {
    throw new Error("[maoyan] Empty movie list")
  }

  logger.info(`[maoyan] got ${list.length} movies`)

  return list.map((m): NewsItem => ({
    id: String(m.movieInfo.movieId),
    title: m.movieInfo.movieName,
    url: `https://piaofang.maoyan.com/movie/${m.movieInfo.movieId}`,
    extra: {
      info: `\n${m.movieInfo.releaseInfo ?? ""} | 累计 ${m.sumBoxDesc} 占比 ${m.boxRate} | 排片${m.showCountRate}`,
    },
  }))
})

const tvViewing = defineSource(async () => {
  const channelId = 40009
  const res = await fetchMaoyanDashboard({}, channelId)

  const list = res?.tvList?.data?.list
  if (!list?.length) {
    throw new Error("[maoyan] Empty TV show list")
  }

  logger.info(`[maoyan] got ${list.length} TV shows`)

  return list.map((t): NewsItem => ({
    id: `${t.channelName}-${t.programmeName}`,
    title: t.programmeName,
    url: `https://piaofang.maoyan.com/i/dashboard/tv-viewing`,
    extra: {
      info: `\n${t.channelName} | 收视率 ${t.attentionRate.toFixed(2)}% | 市占率 ${t.marketRate.toFixed(2)}%`,
    },
  }))
})

const webHeat = defineSource(async () => {
  const channelId = 40009
  const res = await fetchMaoyanDashboard({}, channelId)

  const list = res?.webList?.data?.list
  if (!list?.length) {
    throw new Error("[maoyan] Empty web heat list")
  }

  logger.info(`[maoyan] got ${list.length} web heat items`)

  return list.map((w): NewsItem => ({
    id: String(w.seriesInfo.seriesId),
    title: w.seriesInfo.name,
    url: `https://piaofang.maoyan.com/i/dashboard/web-heat`,
    extra: {
      info: `\n${w.seriesInfo.releaseInfo ?? ""} | 热度 ${w.currHeatDesc} | ${w.seriesInfo.platformDesc ?? ""}`,
    },
  }))
})

export default defineSource({
  "maoyan": boxOffice,
  "maoyan-boxoffice": boxOffice,
  "maoyan-tvviewing": tvViewing,
  "maoyan-webheat": webHeat,
})
