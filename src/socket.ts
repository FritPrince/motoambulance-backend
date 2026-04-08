import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import redis from './lib/redis'

let io: Server

export function setupSocket(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: process.env.CORS_ORIGIN || '*' } })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('Token manquant'))
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!)
      ;(socket as any).user = payload
      next()
    } catch {
      next(new Error('Token invalide'))
    }
  })

  io.on('connection', (socket) => {
    const user = (socket as any).user
    socket.join(`user:${user.userId}`)
    console.log(`[Socket] Connecté — socket: ${socket.id}, userId: ${user?.userId}, room: user:${user?.userId}`)

    socket.on('join', (userId: string) => {
      if (userId === user.userId) {
        socket.join(`user:${userId}`)
      }
    })

    socket.on('responder:update_position', async (data: {
      responderId: string
      alertId: string
      lat: number
      lng: number
    }) => {
      // Seul le responder concerné peut mettre à jour sa position
      if (data.responderId !== user.userId) return

      await redis.geoadd('responders:positions', data.lng, data.lat, data.responderId)

      // Ne pas repasser AVAILABLE si le responder est BUSY sur une alerte
      const currentStatus = await redis.get(`responder:status:${data.responderId}`)
      if (currentStatus !== 'BUSY') {
        await redis.set(`responder:status:${data.responderId}`, 'AVAILABLE')
      }

      io.to(`alert:${data.alertId}`).emit('responder:position_updated', data)
    })

    socket.on('join_alert', (alertId: string) => {
      socket.join(`alert:${alertId}`)
    })
  })

  return io
}

export function getIo() {
  return io
}
