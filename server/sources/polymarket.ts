import type { NewsItem } from "@shared/types"

function formatVolume(volume: number): string {
  const roundedVolume = Math.floor(volume)
  if (roundedVolume >= 1000000) {
    return `$${(roundedVolume / 1000000).toFixed(1)}M`
  } else if (roundedVolume >= 1000) {
    return `$${(roundedVolume / 1000).toFixed(1)}K`
  }
  return `$${roundedVolume}`
}

function processEvent(event: any): NewsItem {
  const markets = (event.markets || []).map((market: any) => {
    let outcomes = market.outcomes
    let outcomePrices = market.outcomePrices

    if (typeof outcomes === "string") {
      try {
        outcomes = JSON.parse(outcomes)
      } catch {
        outcomes = []
      }
    }
    if (typeof outcomePrices === "string") {
      try {
        outcomePrices = JSON.parse(outcomePrices)
      } catch {
        outcomePrices = []
      }
    }

    return {
      slug: market.slug,
      question: market.question,
      description: market.description,
      outcomes,
      outcomePrices,
      volume24hr: formatVolume(market.volume24hr),
      active: market.active,
      url: `https://polymarket.com/zh/event/${event.slug}/${market.slug}`,
    }
  })

  return {
    id: String(event.id),
    title: event.title,
    url: `https://polymarket.com/zh/event/${event.slug}`,
    extra: {
      hover: event.description,
      polymarket: {
        eventSlug: event.slug,
        imageUrl: event.image,
        icon: event.icon,
        endDate: event.endDate,
        active: event.active,
        description: event.description,
        volume24hr: formatVolume(event.volume24hr),
        markets,
      },
    },
  }
}

function processEventTrending(event: any): NewsItem {
  // 暂时不提交 markets，仅保留 event 信息
  // 以后如果需要恢复 markets 显示，可以取消下面代码的注释
  /*
  const markets = (event.markets || [])
    .filter((market: any) => {
      // 过滤 active=false 或没有 outcomePrices 的 market
      if (market.active === false) return false
      if (!market.outcomePrices) return false
      return true
    })
    .map((market: any) => {
      let outcomes = market.outcomes
      let outcomePrices = market.outcomePrices

      if (typeof outcomes === 'string') {
        try {
          outcomes = JSON.parse(outcomes)
        } catch {
          outcomes = []
        }
      }
      if (typeof outcomePrices === 'string') {
        try {
          outcomePrices = JSON.parse(outcomePrices)
        } catch {
          outcomePrices = []
        }
      }

      return {
        slug: market.slug,
        question: market.question,
        description: market.description,
        outcomes,
        outcomePrices,
        volume24hr: formatVolume(market.volume24hr),
        active: market.active,
        url: `https://polymarket.com/zh/event/${event.slug}/${market.slug}`,
      }
    })
  */

  return {
    id: String(event.id),
    title: event.title,
    url: `https://polymarket.com/zh/event/${event.slug}`,
    extra: {
      hover: event.description,
      polymarket: {
        eventSlug: event.slug,
        imageUrl: event.image,
        icon: event.icon,
        endDate: event.endDate,
        active: event.active,
        description: event.description,
        volume24hr: formatVolume(event.volume24hr),
        markets: [], // 暂时不显示 markets
      },
    },
  }
}

const fetchPolymarketNew = defineSource(async () => {
  const url = "https://polymarket.com/_next/data/build-TfctsWXpff2fKS/zh/new.json?category=new"
  const response = await fetch(url)
  const data = await response.json()

  const events = data.pageProps.dehydratedState.queries[2].state.data.pages[0].events || []
  return events.map(processEvent)
})

const fetchPolymarketCarousel = defineSource(async () => {
  const url = "https://polymarket.com/api/homepage/carousel?locale=zh"
  const response = await fetch(url)
  const data = await response.json()

  return (data || []).map((item: any) => processEvent(item.event))
})

const fetchPolymarketBreaking = defineSource(async () => {
  const url = "https://polymarket.com/_next/data/build-TfctsWXpff2fKS/zh/breaking.json"
  const response = await fetch(url)
  const data = await response.json()

  const markets = data.pageProps.dehydratedState.queries[2].state.data.markets || []
  return markets.map((market: any) => {
    const eventSlug = market.events?.[0]?.slug ?? market.slug

    let outcomePrices = market.outcomePrices
    if (typeof outcomePrices === "string") {
      try {
        outcomePrices = JSON.parse(outcomePrices)
      } catch {
        outcomePrices = []
      }
    }

    return {
      id: String(market.condition_id),
      title: market.question,
      url: `https://polymarket.com/zh/event/${eventSlug}/${market.slug}`,
      extra: {
        hover: market.question,
        polymarket: {
          eventSlug,
          imageUrl: market.image,
          icon: market.image,
          active: !market.closed,
          markets: [{
            slug: market.slug,
            question: market.question,
            outcomePrices,
            active: !market.closed,
            url: `https://polymarket.com/zh/event/${eventSlug}/${market.slug}`,
          }],
        },
      },
    }
  })
})

const fetchPolymarketTrending = defineSource(async () => {
  const url = "https://gamma-api.polymarket.com/events/keyset?limit=50&closed=false&order=volume24hr&ascending=false&locale=zh"
  const response = await fetch(url)
  const data = await response.json()

  const events = data.events || []
  return events.map(processEventTrending)
})

const fetchPolymarketZh = defineSource(async () => {
  const url = "https://polymarket.com/_next/data/build-TfctsWXpff2fKS/zh.json"
  const response = await fetch(url)
  const data = await response.json()

  const events = data.pageProps.dehydratedState.queries[0].state.data.pages[0].events || []
  return events.map(processEvent)
})

export default defineSource({
  "polymarket": fetchPolymarketNew,
  "polymarket-new": fetchPolymarketNew,
  "polymarket-carousel": fetchPolymarketCarousel,
  "polymarket-breaking": fetchPolymarketBreaking,
  "polymarket-trending": fetchPolymarketTrending,
  "polymarket-zh": fetchPolymarketZh,
})
