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
    
    // 获取原始响应，检查编码
    const res: FastNewsResponse = await myFetch(apiUrl)
    
    // 检查接口返回是否成功
    if (res.code === "1" && res.data?.fastNewsList) {
      return res.data.fastNewsList.map((item) => {
        // 转换日期格式 (YYYY-MM-DD HH:MM:SS 到 timestamp)
        const pubDate = new Date(item.showTime).getTime()
        
        // 处理字符编码问题，使用 iconv-lite 进行转码
        let title = item.title
        let summary = item.summary
        
        // 尝试修复可能的编码问题 - 简单的UTF-8解码
        try {
          // 检查是否是UTF-8编码
          if (title.match(/[^\x00-\x7F]/)) {
            // 尝试使用Buffer转码
            title = Buffer.from(title, 'latin1').toString('utf8')
          }
        } catch (error) {
          console.error('编码转换错误:', error)
        }
        
        try {
          if (summary.match(/[^\x00-\x7F]/)) {
            summary = Buffer.from(summary, 'latin1').toString('utf8')
          }
        } catch (error) {
          console.error('编码转换错误:', error)
        }
        
        return {
          id: item.code,
          title,
          url: `https://kuaixun.eastmoney.com/news,${item.code}.html`,
          pubDate,
          extra: {
            hover: summary, // 摘要信息
            date: pubDate, // 发布时间
          },
        }
      }).slice(0, 30)
    }
    
    // 如果API失败，返回空数组
    return []
  },
})
