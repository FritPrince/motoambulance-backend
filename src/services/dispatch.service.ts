import redis from '../lib/redis'

export async function findNearestResponder(lat: number, lng: number) {
  const nearby = await redis.georadius(
    'responders:positions',
    lng,
    lat,
    10,
    'km',
    'ASC'
  ) as string[]

  for (const responderId of nearby) {
    const status = await redis.get(`responder:status:${responderId}`)
    if (status === 'AVAILABLE') {
      await redis.set(`responder:status:${responderId}`, 'BUSY')
      return responderId
    }
  }

  return null
}
