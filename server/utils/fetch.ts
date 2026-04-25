import process from "node:process"
import { $fetch } from "ofetch"

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
    const undici = await import("undici")

    // 优先尝试 EnvHttpProxyAgent（自动读取环境变量）
    if ("EnvHttpProxyAgent" in undici) {
      dispatcher = new undici.EnvHttpProxyAgent()
      console.log("[proxy] 使用 EnvHttpProxyAgent 配置代理")
    } else if ("ProxyAgent" in undici) {
      // 否则使用 ProxyAgent，优先使用 HTTPS_PROXY
      const proxyUrl = httpsProxy || httpProxy
      if (proxyUrl) {
        dispatcher = new undici.ProxyAgent(proxyUrl)
        console.log(`[proxy] 使用 ProxyAgent 配置代理: ${proxyUrl}`)
      }
    }
  } catch (e) {
    console.warn("[proxy] 无法加载 undici，代理配置可能不生效:", e)
  }
}

export const myFetch = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  timeout: 10000,
  retry: 3,
  async onRequest({ options }) {
    // 在每次请求前确保 dispatcher 已初始化
    await initDispatcher()
    if (dispatcher) {
      options.dispatcher = dispatcher
    }
  },
})
