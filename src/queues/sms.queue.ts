import Bull from 'bull'
import twilio from 'twilio'

export const smsQueue = new Bull('sms', {
  redis: process.env.REDIS_URL,
})

smsQueue.process(async (job) => {
  const { to, message } = job.data
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_FROM,
    to,
  })
})

smsQueue.on('failed', (job, err) => {
  console.error(`[SMS] Échec job ${job.id} :`, err.message)
})
