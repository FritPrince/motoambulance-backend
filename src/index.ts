import 'dotenv/config'
import http from 'http'
import app from './app'
import { setupSocket } from './socket'
import './queues/sms.queue'
import './queues/notification.queue'

const PORT = process.env.PORT || 3000

const httpServer = http.createServer(app)

setupSocket(httpServer)

httpServer.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`)
})
