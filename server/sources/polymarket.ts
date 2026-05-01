import type { NewsItem } from "@shared/types"

function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `$${(volume / 1000000).toFixed(1)}M`
  } else if (volume >= 1000) {
    return `$${(volume / 1000).toFixed(1)}K`
  }
  return `$${volume}`
}

function processEvent(event: any): NewsItem {
  const markets = (event.markets || []).map((market: any) => ({
    slug: market.slug,
    question: market.question,
    description: market.description,
    outcomes: market.outcomes,
    outcomePrices: market.outcomePrices,
    volume24h: formatVolume(market.volume24hr),
    active: market.active,
    url: `https://polymarket.com/zh/event/${event.slug}/${market.slug}`,
  }))

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
        markets,
      },
    },
  }
}

const fetchPolymarket = defineSource(async () => {
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
            outcomePrices: market.outcomePrices,
            active: !market.closed,
            url: `https://polymarket.com/zh/event/${eventSlug}/${market.slug}`,
          }],
        },
      },
    }
  })
})

export default defineSource({
  "polymarket": fetchPolymarket,
  "polymarket-new": fetchPolymarket,
  "polymarket-carousel": fetchPolymarketCarousel,
  "polymarket-breaking": fetchPolymarketBreaking,
})
