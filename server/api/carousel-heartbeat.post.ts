import { isSchedulerActive, updateHeartbeat } from "#/plugins/carousel-scheduler"

export default defineEventHandler(() => {
  updateHeartbeat()
  return {
    success: true,
    active: isSchedulerActive(),
  }
})
