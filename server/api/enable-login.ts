import process from "node:process"

export default defineEventHandler(async () => {
  const enabled = !["JWT_SECRET", "G_CLIENT_ID", "G_CLIENT_SECRET"].find(k => !process.env[k])
  return {
    enable: enabled,
    url: enabled ? `https://github.com/login/oauth/authorize?client_id=${process.env.G_CLIENT_ID}` : null,
  }
})
