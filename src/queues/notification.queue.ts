import Bull from 'bull'

export const notificationQueue = new Bull('notification', {
  redis: process.env.REDIS_URL,
})

notificationQueue.process(async (job) => {
  const { userId, title, body } = job.data
  console.log(`[NOTIF] → ${userId} : ${title} — ${body}`)
})

notificationQueue.on('failed', (job, err) => {
  console.error(`[NOTIF] Échec job ${job.id} :`, err.message)
})
