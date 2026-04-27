import type { SourceID } from "@shared/types"
import { getCacheTable } from "#/database/cache"

export default defineEventHandler(async (event) => {
  try {
    const cacheTable = await getCacheTable()
    if (!cacheTable) {
      throw createError({
        statusCode: 500,
        message: "Cache database not available",
      })
    }

    if (event.method === "GET") {
      const query = getQuery(event)
      const id = query.id as SourceID
      if (id) {
        const useProxy = await cacheTable.getUseProxy(id)
        return { id, useProxy }
      } else {
        const all = await cacheTable.getAllUseProxy()
        return { all }
      }
    } else if (event.method === "POST") {
      const body = await readBody(event)
      const { id, useProxy } = body as { id: SourceID; useProxy: boolean }
      if (!id || typeof useProxy !== "boolean") {
        throw createError({
          statusCode: 400,
          message: "Invalid request body",
        })
      }
      await cacheTable.setUseProxy(id, useProxy)
      return { success: true, id, useProxy }
    }
  } catch (e) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})
