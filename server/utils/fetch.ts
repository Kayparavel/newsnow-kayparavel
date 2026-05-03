import process from "node:process"
import { AsyncLocalStorage } from "node:async_hooks"
import { $fetch } from "ofetch"
import type { $Fetch } from "ofetch"

// 使用 AsyncLocalStorage 存储当前请求的 useProxy 配置
// 这样每个请求的上下文是隔离的，不会被其他请求污染
const useProxyStorage = new AsyncLocalStorage<boolean>()

export { useProxyStorage }

// 尝试从环境变量获取代理配置
const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || process.env.PROXY || process.env.proxy
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.PROXY || process.env.proxy

// 存储 dispatcher（延迟初始化）
let dispatcher: any = null

// 初始化 dispatcher（只执行一次）
let dispatcherInitialized = false
async function initDispatcher() {
  if (dispatcherInitialized) return
  dispatcherInitialized = true

  if (!httpProxy && !httpsProxy) return

  try {
    // 动态导入 undici
    const undici = await import("undici" as any)

    // 优先尝试 EnvHttpProxyAgent（自动读取环境变量）
    if ("EnvHttpProxyAgent" in undici) {
      dispatcher = new undici.EnvHttpProxyAgent()
      logger.info("[proxy] 使用 EnvHttpProxyAgent 配置代理")
    } else if ("ProxyAgent" in undici) {
      // 否则使用 ProxyAgent，优先使用 HTTPS_PROXY
      const proxyUrl = httpsProxy || httpProxy
      if (proxyUrl) {
        dispatcher = new undici.ProxyAgent(proxyUrl)
        logger.info(`[proxy] 使用 ProxyAgent 配置代理: ${proxyUrl}`)
      }
    }
  } catch (e) {
    logger.warn("[proxy] 无法加载 undici，代理配置可能不生效:", e)
  }
}

// 直连 fetch（不使用代理）
export const myFetchDirect = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
})

// 代理 fetch（使用代理）
export const myFetchProxy = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
  async onRequest({ options }) {
    await initDispatcher()
    if (dispatcher) {
      options.dispatcher = dispatcher
    }
  },
})

// 根据 AsyncLocalStorage 上下文返回对应的 fetch 实例
function getCurrentFetch() {
  const useProxy = useProxyStorage.getStore() ?? false
  return useProxy ? myFetchProxy : myFetchDirect
}

// 默认 myFetch，使用 AsyncLocalStorage 中的上下文决定
export const myFetch = new Proxy(myFetchDirect, {
  apply(_target, thisArg, args) {
    const fetchFn = getCurrentFetch()
    logger.info(`[proxy] using fetch: ${fetchFn === myFetchProxy ? "proxy" : "direct"}`)
    return Reflect.apply(fetchFn as any, thisArg, args)
  },
}) as $Fetch

const scrapingProxyEnvKeys = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "PROXY", "proxy"] as const

export async function myScrapingFetch(url: string, extraOptions?: Record<string, any>) {
  const { gotScraping } = await import("got-scraping")
  const useProxy = useProxyStorage.getStore() ?? false
  logger.info(`[scraping] useProxy: ${useProxy}`)

  const options: Record<string, any> = {
    url,
    http2: false,
    ...extraOptions,
  }

  if (!useProxy) {
    const saved = scrapingProxyEnvKeys.map(k => [k, process.env[k]] as const)
    scrapingProxyEnvKeys.forEach(k => delete process.env[k])
    try {
      return await gotScraping(options)
    } finally {
      saved.forEach(([k, v]) => {
        if (v) process.env[k] = v
      })
    }
  }

  const proxyUrl = scrapingProxyEnvKeys.map(k => process.env[k]).find(Boolean)
  if (proxyUrl) {
    options.proxyUrl = proxyUrl
    logger.info(`[scraping] proxyUrl: ${proxyUrl}`)
  }
  return await gotScraping(options)
}
