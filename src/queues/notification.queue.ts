import Bull from 'bull'

export const notificationQueue = new Bull('notification', {
  redis: process.env.REDIS_URL,
})

notificationQueue.process(async (job) => {
  const { playerIds, title, body } = job.data

  await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${process.env.ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      include_subscription_ids: playerIds,
      contents: { en: body, fr: body },
      headings: { en: title, fr: title },
    }),
  })
})

notificationQueue.on('failed', (job, err) => {
  console.error(`[NOTIF] Échec job ${job.id} :`, err.message)
})
