import { myFetch } from "#/utils/fetch"
import { defineSource } from "#/utils/source"

/**
 * 综合早报
 */
const comprehensiveNews = defineSource(async () => {
  const url = "https://i.news.qq.com/web_backend/v2/getTagInfo?tagId=aEWqxLtdgmQ%3D"
  const res = await myFetch(url, {
    headers: {
      Referer: "https://news.qq.com/",
    },
  })
  return res.data.tabs[0].articleList.map((news: any) => ({
    id: news.id,
    title: news.title,
    url: news.link_info.url,
    extra: {
      hover: news.desc,
    },
  }))
})

export default defineSource({
  "tencent-hot": comprehensiveNews,
})
