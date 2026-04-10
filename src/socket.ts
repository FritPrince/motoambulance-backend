import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import redis from './lib/redis'
import { sendPush } from './services/onesignal.service'

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
    if (user.role === 'PATIENT') socket.join('patients')
    if (user.role === 'RESPONDER') {
      sendPush(user.userId, 'MotoAmbulance', 'Bienvenue, vous êtes connecté en tant que secouriste.').catch(() => {})
    }
    console.log(`[Socket] Connecté — socket: ${socket.id}, userId: ${user?.userId}, role: ${user?.role}`)

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
      if (data.responderId !== user.userId) return

      console.log(`[Socket] responder:update_position reçu — responderId: ${data.responderId}, lat: ${data.lat}, lng: ${data.lng}`)

      await redis.geoadd('responders:positions', data.lng, data.lat, data.responderId)

      const currentStatus = await redis.get(`responder:status:${data.responderId}`)
      if (currentStatus !== 'BUSY') {
        await redis.set(`responder:status:${data.responderId}`, 'AVAILABLE')
        const patientsRoom = io.sockets.adapter.rooms.get('patients')
        console.log(`[Socket] Emission responders:updated → room patients (${patientsRoom?.size ?? 0} socket(s))`)
        io.to('patients').emit('responders:updated')
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
