import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/auth.routes'
import alertsRoutes from './routes/alerts.routes'
import subscriptionsRoutes from './routes/subscriptions.routes'

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

app.use('/auth', authRoutes)
app.use('/alerts', alertsRoutes)
app.use('/subscriptions', subscriptionsRoutes)

export default app
