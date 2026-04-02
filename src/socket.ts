import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import redis from './lib/redis'

let io: Server

export function setupSocket(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } })

  io.on('connection', (socket) => {
    socket.on('join', (userId: string) => {
      socket.join(`user:${userId}`)
    })

    socket.on('responder:update_position', async (data: {
      responderId: string
      alertId: string
      lat: number
      lng: number
    }) => {
      await redis.geoadd('responders:positions', data.lng, data.lat, data.responderId)
      await redis.set(`responder:status:${data.responderId}`, 'AVAILABLE')
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
