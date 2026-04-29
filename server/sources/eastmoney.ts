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

// 通用的东方财富获取函数
async function fetchEastMoneyNews(fastColumn: string): Promise<any[]> {
  const timestamp = Date.now()
  const apiUrl = `https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=${fastColumn}&sortEnd=&pageSize=50&req_trace=${timestamp}&_=${timestamp}`

  const res: FastNewsResponse = await myFetch(apiUrl)

  if (res.code === "1" && res.data?.fastNewsList) {
    return res.data.fastNewsList.map((item) => {
      const pubDate = new Date(item.showTime).getTime()

      return {
        id: item.code,
        title: item.title,
        url: `https://finance.eastmoney.com/a/${item.code}.html`,
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

// 财经快讯 (fastColumn=102)
const flashNews = defineSource(async () => {
  return await fetchEastMoneyNews("102")
})

// 焦点 (fastColumn=101)
const focusNews = defineSource(async () => {
  return await fetchEastMoneyNews("101")
})

export default defineSource({
  "eastmoney": flashNews,
  "eastmoney-flash": flashNews,
  "eastmoney-focus": focusNews,
})
