import Bull from 'bull'
import * as OneSignal from '@onesignal/node-onesignal'

export const notificationQueue = new Bull('notification', {
  redis: process.env.REDIS_URL,
})

notificationQueue.process(async (job) => {
  const { playerIds, title, body } = job.data

  const config = OneSignal.createConfiguration({
    appKey: process.env.ONESIGNAL_API_KEY!,
  })
  const client = new OneSignal.DefaultApi(config)

  const notification = new OneSignal.Notification()
  notification.app_id = process.env.ONESIGNAL_APP_ID!
  notification.include_player_ids = playerIds
  notification.contents = { en: body, fr: body }
  notification.headings = { en: title, fr: title }

  await client.createNotification(notification)
})

notificationQueue.on('failed', (job, err) => {
  console.error(`[NOTIF] Échec job ${job.id} :`, err.message)
})
