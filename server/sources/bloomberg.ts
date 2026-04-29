function getAlt(item: any): string {
  if (item.image?.alt) {
    return item.image.alt
  } else if (item.media?.defaultImage?.alt) {
    return item.media.defaultImage.alt
  } else if (item.lede?.alt) {
    return item.lede.alt
  }
  return ""
}

function fetchStories(locale: string) {
  return async () => {
    const url = `https://www.bloomberg.com/lineup-next/api/stories?types=ARTICLE%2CFEATURE%2CINTERACTIVE%2CLETTER%2CEXPLAINERS&locale=${locale}&pageNumber=1&limit=50`
    const stories = await myFetch(url)

    return stories.map((item: any): NewsItem => {
      const alt = getAlt(item)

      return {
        id: item.id,
        title: item.headline,
        url: `https://www.bloomberg.com${item.url}`,
        pubDate: new Date(item.updatedAt).getTime(),
        extra: {
          info: item.eyebrow?.text || "",
          hover: alt ? `${item.headline} — ${alt}` : item.headline,
        },
      }
    })
  }
}

export default defineSource({
  "bloomberg-hot": async () => {
    const url = "https://personalization.bloomberg.com/popular/resources?minAge=0&maxAge=86400000&limit=50&facets=Story%7CAll"
    const data = await myFetch(url)
    const stories = data["Story|All"] || []

    return stories.map((item: any): NewsItem => {
      const infoParts = []
      if (item.label) {
        infoParts.push(item.label)
      }
      infoParts.push(Math.round(item.score))

      return {
        id: item.assetID,
        title: item.headline,
        url: item.url,
        pubDate: new Date(item.publishedAt).getTime(),
        extra: {
          info: infoParts.join(" • "),
        },
      }
    })
  },

  "bloomberg-market": async () => {
    const url = "https://www.bloomberg.com/lineup-next/api/market-movers/stories?limit=50&pageNumber=1"
    const stories = await myFetch(url)

    return stories.map((item: any): NewsItem => {
      const alt = getAlt(item)

      return {
        id: item.id,
        title: item.headline,
        url: `https://www.bloomberg.com${item.url}`,
        pubDate: new Date(item.updatedAt).getTime(),
        extra: {
          info: item.eyebrow?.text || "",
          hover: alt ? `${item.headline} — ${alt}` : item.headline,
        },
      }
    })
  },

  "bloomberg-us": fetchStories("us"),
  "bloomberg-ja": fetchStories("ja"),
})
