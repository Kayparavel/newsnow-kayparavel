interface MySteelNewsItem {
  id: number
  categoryId: number
  sectionId: number
  content: string
  relationBreedId: string
  relationBreed: { name: string; id: string }[]
  relationCityId: string
  relationCity: any[]
  relationFactoryId: string
  relationFactory: { name: string; id: number }[]
  relationPortId: string
  relationPort: { name: string; id: number }[]
  inArticleTitle: string
  inArticleUrl: string
  outArticleTitle: string
  outArticleUrl: string
  source: string
  imageUrl: any[]
  publisherTime: number
  dataSource: number
  relationId: number
  inArticleAid: number
  outArticleAid: number
  shareImageUrl: string
  wapRestrict: boolean
  wapResidualWords: string | null
  sectionName: string
  categoryName: string
  voiceUrl: string
  readingCount: any
  advertisementFlag: number
  breedTags: string[]
  breedTagIdNames: { name: string; id: string }[]
  publisherId: number
  relationActivityId: number
  aiFlag: number
}

interface MySteelResponse {
  pageNo: number
  pageSize: number
  total: number
  totalPage: number
  isValid: boolean
  list: MySteelNewsItem[]
}

export default defineSource({
  "mysteel": async () => {
    // 使用我的钢铁的API接口获取快讯数据
    const apiUrl = "https://openapi.mysteel.com/without_sign/newsflash/flashnews/query_by_tags.htm"
    
    // 直接使用项目提供的 myFetch 函数
    const res: MySteelResponse = await myFetch(apiUrl)
    
    // 检查接口返回是否成功
    if (res.isValid && res.list) {
      return res.list.map((item) => {
        // 转换日期格式 (timestamp 到 Date)
        const pubDate = item.publisherTime
        
        return {
          id: item.id.toString(),
          title: item.content, // 内容作为标题
          url: item.inArticleUrl || item.outArticleUrl, // 优先使用内文链接，否则使用外文链接
          pubDate,
          extra: {
            date: pubDate, // 发布时间
            info: item.breedTags.join(", "), // 品种标签
          },
        }
      }).slice(0, 30)
    }
    
    // 如果API失败，返回空数组
    return []
  },
})
