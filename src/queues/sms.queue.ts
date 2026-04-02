import Bull from 'bull'
const AfricasTalking = require('africastalking')

export const smsQueue = new Bull('sms', {
  redis: process.env.REDIS_URL,
})

smsQueue.process(async (job) => {
  const { to, message } = job.data
  const at = AfricasTalking({
    apiKey: process.env.AT_API_KEY!,
    username: process.env.AT_USERNAME!,
  })
  await at.SMS.send({ to: [to], message, from: '' })
})

smsQueue.on('failed', (job, err) => {
  console.error(`[SMS] Échec job ${job.id} :`, err.message)
})
