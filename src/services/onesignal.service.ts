import redis from '../lib/redis'

export async function sendPush(userId: string, title: string, body: string) {
  const token = await redis.get(`push-token:${userId}`)
  if (!token) return

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  }).catch(() => {})
}
