import type { NewsItem } from "@shared/types"

interface FastNewsItem {
  code: string
  image: any[]
  pinglun_Num: number
  realSort: string
  share: number
  showTime: string
  stockList: any[]
  summary: string
  title: string
  titleColor: number
}

interface FastNewsResponse {
  code: string
  data: {
    fastNewsList: FastNewsItem[]
  }
  message: string
}

export default defineSource({
  "eastmoney": async () => {
    // 使用东方财富的API接口获取快讯数据
    const timestamp = Date.now()
    const apiUrl = `https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=50&req_trace=${timestamp}&_=${timestamp}`
    
    // 直接使用项目提供的 myFetch 函数
    const res: FastNewsResponse = await myFetch(apiUrl)
    
    // 检查接口返回是否成功
    if (res.code === "1" && res.data?.fastNewsList) {
      return res.data.fastNewsList.map((item) => {
        // 转换日期格式 (YYYY-MM-DD HH:MM:SS 到 timestamp)
        const pubDate = new Date(item.showTime).getTime()
        
        return {
          id: item.code,
          title: item.title,
          url: `https://finance.eastmoney.com/a/${item.code}.html`,
          pubDate,
          extra: {
            hover: item.summary, // 摘要信息
            date: pubDate, // 发布时间
          },
        }
      }).slice(0, 30)
    }
    
    // 如果API失败，返回空数组
    return []
  },
})
