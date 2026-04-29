import * as cheerio from "cheerio"
import type { NewsItem } from "@shared/types"

// 格式化数值，将大数值转换为万/亿单位
function formatNumber(value: string | null | undefined): string {
  if (value == null || value === "") {
    return "-"
  }

  // 尝试解析数值
  let num: number
  try {
    num = Number.parseFloat(value.toString().replace(/,/g, ""))
  } catch {
    return value.toString()
  }

  if (Number.isNaN(num)) {
    return value.toString()
  }

  // 亿级（>= 100,000,000）
  if (Math.abs(num) >= 100000000) {
    const result = (num / 100000000).toFixed(2)
    return `${result}亿`
  }

  // 万级（>= 10,000）
  if (Math.abs(num) >= 10000) {
    const result = (num / 10000).toFixed(2)
    return `${result}万`
  }

  // 小于万级，原样返回
  return value.toString()
}

interface CalendarDataModel {
  calendarId: number
  title: string
  country: string
  countryImg?: string
  releasedDate: number
  actual?: string
  previous?: string
  consensus?: string
  unit?: string
  important?: number
  star?: number
}

interface CalendarEventModel {
  calendarId: string
  eventContent: string
  speaker?: string
  country?: string
  countryImg?: string
  releasedDate: number
  star?: number
}

interface CalendarHolidayModel {
  calendarId?: string
  holidayName?: string
  country?: string
  countryImg?: string
  releasedDate?: number
  star?: number
  title?: string
}

interface MergeListItem {
  calendarDataModel?: CalendarDataModel
  calenderEventModel?: CalendarEventModel
  calenderHolidayModel?: CalendarHolidayModel
  country?: string
  publicStatus?: number
  releasedDate: number
  type: number
}

interface BodyMessage {
  calendarCountryCategoryModelList?: any
  economicsAttributeModelList?: any
  economicsCategoryModelList?: any
  mergeList: MergeListItem[]
}

interface FastBullResponse {
  code: number
  subCode: string
  message: string
  bodyMessage: string
}

const express = defineSource(async () => {
  // 获取今日 00:00:00 的时间戳
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startTimestamp = today.getTime()
  // 获取今日 23:59:59 的时间戳
  const endTimestamp = startTimestamp + 24 * 60 * 60 * 1000 - 1

  const url = `https://api.fastbull.cn/fastbull-news-service/api/getMergeCalendarV1Page?pageSize=50&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&importance=3`

  const res: FastBullResponse = await myFetch(url)

  if (res.code !== 0 || !res.bodyMessage) {
    return []
  }

  try {
    const bodyData: BodyMessage = JSON.parse(res.bodyMessage)

    if (!bodyData.mergeList || !Array.isArray(bodyData.mergeList)) {
      return []
    }

    return bodyData.mergeList
      .filter(item => item.type === 1 || item.type === 2 || item.type === 3) // 保留经济数据、事件和假期
      .sort((a, b) => b.releasedDate - a.releasedDate)
      .map((item) => {
        let title = ""
        let content = ""
        let countryImg: string | undefined
        let infoText: string | undefined

        if (item.type === 1 && item.calendarDataModel) {
          // 经济数据类型
          const originalTitle = item.calendarDataModel.title || "经济数据"
          const data = item.calendarDataModel
          const parts: string[] = []
          if (data.country) parts.push(data.country)
          parts.push(originalTitle)

          // 添加数据值（公/预/前）
          const dataParts: string[] = []
          const actualFormatted = formatNumber(data.actual)
          const consensusFormatted = formatNumber(data.consensus)
          const previousFormatted = formatNumber(data.previous)

          dataParts.push(`公: ${actualFormatted}${data.unit || ""}`)
          if (data.consensus !== null && data.consensus !== undefined) {
            dataParts.push(`预: ${consensusFormatted}${data.unit || ""}`)
          }
          if (data.previous !== null && data.previous !== undefined) {
            dataParts.push(`前: ${previousFormatted}${data.unit || ""}`)
          }

          // title = 原标题 + 换行 + 三个数据
          if (dataParts.length > 0) {
            title = `${originalTitle}\n${dataParts.join("  ")}`
            content = `${parts.join(" - ")}\n${dataParts.join("  ")}`
          } else {
            title = originalTitle
            content = parts.join(" - ")
          }

          // info 只保留 "数据"
          infoText = "数据"

          countryImg = data.countryImg
        } else if (item.type === 2 && item.calenderEventModel) {
          // 事件类型
          title = item.calenderEventModel.eventContent || "事件"
          const parts: string[] = []
          if (item.calenderEventModel.speaker) parts.push(item.calenderEventModel.speaker)
          parts.push(title)
          content = parts.join(" - ")
          infoText = "事件"
          countryImg = item.calenderEventModel.countryImg
        } else if (item.type === 3 && item.calenderHolidayModel) {
          // 假期类型
          title = item.calenderHolidayModel.title || "假期"
          const parts: string[] = []
          if (item.calenderHolidayModel.country) parts.push(item.calenderHolidayModel.country)
          parts.push(title)
          content = parts.join(" - ")
          infoText = `假期` + ` ${item.country} ${item.calenderHolidayModel.holidayName || ""}`
          countryImg = item.calenderHolidayModel.countryImg
        }

        return {
          id: (item.calendarDataModel?.calendarId || item.calenderEventModel?.calendarId || item.calenderHolidayModel?.calendarId || Date.now().toString() + Math.random().toString(36).substr(2, 9)).toString(),
          title,
          pubDate: item.releasedDate,
          extra: {
            info: infoText,
            hover: content,
            icon: countryImg ? { url: countryImg, scale: 0.75 } : undefined,
          },
          url: `https://www.fastbull.cn`, // 法布财经主页
        }
      })
  } catch (parseError) {
    console.warn("Failed to parse bodyMessage:", parseError)
    return []
  }
})

const news = defineSource(async () => {
  const baseURL = "https://www.fastbull.com"
  const html: any = await myFetch(`${baseURL}/cn/news`)
  const $ = cheerio.load(html)
  const $main = $(".trending_type")
  const news: NewsItem[] = []
  $main.each((_, el) => {
    const a = $(el)
    const url = a.attr("href")
    const title = a.find(".title").text()
    const date = a.find("[data-date]").attr("data-date")
    if (url && title && date) {
      news.push({
        url: baseURL + url,
        title,
        id: url,
        pubDate: Number(date),
      })
    }
  })
  return news
})

export default defineSource(
  {
    "fastbull": express,
    "fastbull-express": express,
    "fastbull-news": news,
  },
)
