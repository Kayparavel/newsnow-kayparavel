const X_UA = "V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&UID=58d7e3f2-e41d-4096-beab-88263066696a&OS=Windows&OSV=10&DT=PC"

async function fetchTapTop(typeName: string): Promise<NewsItem[]> {
  const ua = encodeURIComponent(X_UA)
  const url = `https://www.taptap.cn/webapiv2/app-top/v2/hits?from=0&limit=10&type_name=${typeName}&X-UA=${ua}`
  const res = await myFetch(url) as any
  return res.data.list
    .filter((item: any) => item.app)
    .map((item: any) => {
      const app = item.app
      const tags = app.tags?.map((t: any) => t.value).join("/") || ""
      const score = app.stat?.rating?.score || ""
      const info = `${tags}${score ? ` · ${score}分` : ""}`
      return {
        id: app.id,
        title: app.title,
        url: `https://www.taptap.cn/app/${app.id}`,
        extra: {
          info,
        },
      }
    })
}

const taptapHot = defineSource(() => fetchTapTop("hot"))
const taptapSell = defineSource(() => fetchTapTop("sell"))

export default defineSource({
  "taptap": taptapHot,
  "taptap-hot": taptapHot,
  "taptap-sell": taptapSell,
})
