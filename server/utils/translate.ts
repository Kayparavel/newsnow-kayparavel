import process from "node:process"
import crypto from "node:crypto"

// 腾讯云翻译 API 配置
const SECRET_ID = process.env.TENCENT_SECRET_ID
const SECRET_KEY = process.env.TENCENT_SECRET_KEY
const API_ENDPOINT = "https://tmt.tencentcloudapi.com"
const SERVICE = "tmt"
const VERSION = "2018-03-21"
const ACTION = "TextTranslate"

// 检查翻译功能是否启用
export function isTranslateEnabled(): boolean {
  return !!(SECRET_ID && SECRET_KEY)
}

// 生成腾讯云 API 签名
function generateSignature(payload: string, timestamp: number): string {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const credentialScope = `${date}/${SERVICE}/tc3_request`

  // 步骤 1：拼接规范请求串
  const canonicalRequest = [
    "POST",
    "/",
    "",
    "content-type:application/json\nhost:tmt.tencentcloudapi.com\nx-tc-action:texttranslate\n",
    "content-type;host;x-tc-action",
    crypto.createHash("sha256").update(payload).digest("hex"),
  ].join("\n")

  // 步骤 2：拼接待签名字符串
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp.toString(),
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n")

  // 步骤 3：计算签名
  const secretDate = crypto.createHmac("sha256", `TC3${SECRET_KEY}`).update(date).digest()
  const secretService = crypto.createHmac("sha256", secretDate).update(SERVICE).digest()
  const secretSigning = crypto.createHmac("sha256", secretService).update("tc3_request").digest()
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign).digest("hex")

  // 步骤 4：拼接 Authorization
  return `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`
}

// 调用腾讯云翻译 API
async function callTranslateAPI(text: string, source: string, target: string): Promise<string> {
  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error("腾讯云翻译 API 未配置，请设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY 环境变量")
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const payload = JSON.stringify({
    SourceText: text,
    Source: source,
    Target: target,
    ProjectId: 0,
  })

  const authorization = generateSignature(payload, timestamp)

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": "tmt.tencentcloudapi.com",
      "X-TC-Action": ACTION,
      "X-TC-Version": VERSION,
      "X-TC-Region": "ap-guangzhou",
      "X-TC-Timestamp": timestamp.toString(),
      "Authorization": authorization,
    },
    body: payload,
  })

  if (!response.ok) {
    throw new Error(`翻译 API 请求失败: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (data.Response?.Error) {
    throw new Error(`翻译 API 错误: ${data.Response.Error.Code} - ${data.Response.Error.Message}`)
  }

  return data.Response?.TargetText || text
}

// 翻译文本（带缓存）
const translateCache = new Map<string, string>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 小时

export async function translateText(text: string, source: string = "auto", target: string = "zh"): Promise<string> {
  // 检查缓存
  const cacheKey = `${source}:${target}:${text}`
  const cached = translateCache.get(cacheKey)
  if (cached) {
    logger.info(`[translate] Cache hit for: "${text.substring(0, 50)}..."`)
    return cached
  }

  // 检查是否启用翻译
  if (!isTranslateEnabled()) {
    logger.warn("[translate] Translation is not enabled")
    return text
  }

  try {
    // 调用翻译 API
    logger.info(`[translate] Calling API for: "${text.substring(0, 50)}..."`)
    const translated = await callTranslateAPI(text, source, target)
    logger.info(`[translate] API result: "${text.substring(0, 30)}..." -> "${translated.substring(0, 30)}..."`)

    // 存入缓存
    translateCache.set(cacheKey, translated)

    // 清理过期缓存
    setTimeout(() => {
      translateCache.delete(cacheKey)
    }, CACHE_TTL)

    return translated
  } catch (error) {
    logger.error("[translate] 翻译失败:", error)
    return text // 翻译失败返回原文
  }
}

// 批量翻译（合并请求，减少 API 调用）
export async function translateBatch(texts: string[], source: string = "en", target: string = "zh"): Promise<string[]> {
  if (!isTranslateEnabled()) {
    return texts
  }

  // 单次请求最大 6000 字符，这里保守一点用 5000
  const MAX_CHARS = 5000
  const results: string[] = []
  let currentBatch: string[] = []
  let currentLength = 0

  for (const text of texts) {
    if (currentLength + text.length > MAX_CHARS && currentBatch.length > 0) {
      // 当前批次已满，翻译并清空
      const translated = await callTranslateAPI(currentBatch.join("\n"), source, target)
      results.push(...translated.split("\n"))
      currentBatch = []
      currentLength = 0
    }
    currentBatch.push(text)
    currentLength += text.length
  }

  // 翻译最后一批
  if (currentBatch.length > 0) {
    const translated = await callTranslateAPI(currentBatch.join("\n"), source, target)
    results.push(...translated.split("\n"))
  }

  return results
}

// 批量翻译文本（用换行符连接，一次性翻译）
async function batchTranslateTexts(texts: string[]): Promise<string[]> {
  if (!texts.length) return []
  if (!isTranslateEnabled()) return texts

  // 单次请求最大 6000 字符，保守用 5000
  const MAX_CHARS = 5000
  const results: string[] = []
  let currentBatch: string[] = []
  let currentLength = 0

  for (const text of texts) {
    // +1 是换行符的长度
    if (currentLength + text.length + 1 > MAX_CHARS && currentBatch.length > 0) {
      // 当前批次已满，翻译并清空
      const translated = await callTranslateAPI(currentBatch.join("\n"), "auto", "zh")
      results.push(...translated.split("\n"))
      currentBatch = []
      currentLength = 0
      // 等待 400ms 避免限流
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    currentBatch.push(text)
    currentLength += text.length + 1
  }

  // 翻译最后一批
  if (currentBatch.length > 0) {
    const translated = await callTranslateAPI(currentBatch.join("\n"), "auto", "zh")
    results.push(...translated.split("\n"))
  }

  return results
}

// 翻译 NewsItem 数组
export async function translateNewsItems(items: any[]): Promise<any[]> {
  if (!isTranslateEnabled()) {
    logger.warn("[translate] Translation is not enabled, returning original items")
    return items
  }

  logger.info(`[translate] Translating ${items.length} items`)

  // 收集所有需要翻译的标题
  const titles: string[] = []
  const titleIndexes: number[] = [] // 记录哪些条目有标题
  for (let i = 0; i < items.length; i++) {
    if (items[i].title) {
      titles.push(items[i].title)
      titleIndexes.push(i)
    }
  }

  // 批量翻译标题
  let translatedTitles: string[] = []
  if (titles.length > 0) {
    logger.info(`[translate] Batch translating ${titles.length} titles`)
    translatedTitles = await batchTranslateTexts(titles)
  }

  // 收集所有需要翻译的 hover 信息
  const hovers: string[] = []
  const hoverIndexes: number[] = [] // 记录哪些条目有 hover
  for (let i = 0; i < items.length; i++) {
    if (items[i].extra?.hover) {
      hovers.push(items[i].extra.hover)
      hoverIndexes.push(i)
    }
  }

  // 批量翻译 hover 信息
  let translatedHovers: string[] = []
  if (hovers.length > 0) {
    logger.info(`[translate] Batch translating ${hovers.length} hover texts`)
    translatedHovers = await batchTranslateTexts(hovers)
  }

  // 组装翻译结果
  const translatedItems = items.map(item => ({ ...item }))

  // 更新标题
  for (let i = 0; i < titleIndexes.length; i++) {
    const itemIndex = titleIndexes[i]
    if (translatedTitles[i] && translatedTitles[i] !== items[itemIndex].title) {
      translatedItems[itemIndex].title = translatedTitles[i]
      logger.info(`[translate] Title: "${items[itemIndex].title}" -> "${translatedTitles[i]}"`)
    }
  }

  // 更新 hover 信息
  for (let i = 0; i < hoverIndexes.length; i++) {
    const itemIndex = hoverIndexes[i]
    if (translatedHovers[i] && translatedHovers[i] !== items[itemIndex].extra.hover) {
      translatedItems[itemIndex].extra = {
        ...items[itemIndex].extra,
        hover: translatedHovers[i],
      }
      logger.info(`[translate] Hover: "${items[itemIndex].extra.hover}" -> "${translatedHovers[i]}"`)
    }
  }

  logger.info(`[translate] Translation completed`)
  return translatedItems
}
