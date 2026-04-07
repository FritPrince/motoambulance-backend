import redis from '../lib/redis'
import prisma from '../lib/prisma'

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
    if (status !== 'AVAILABLE') continue

    // Vérifie que l'utilisateur a bien le rôle RESPONDER en base
    const user = await prisma.user.findUnique({
      where: { id: responderId },
      select: { role: true },
    })
    if (!user || user.role !== 'RESPONDER') continue

    await redis.set(`responder:status:${responderId}`, 'BUSY')
    return responderId
  }

  return null
}
