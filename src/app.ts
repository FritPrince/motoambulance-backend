import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/auth.routes'
import alertsRoutes from './routes/alerts.routes'
import subscriptionsRoutes from './routes/subscriptions.routes'
import respondersRoutes from './routes/responders.routes'

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))

// Capture du raw body pour la vérification de signature webhook FedaPay
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf
    },
  })
)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

app.use('/auth', authRoutes)
app.use('/alerts', alertsRoutes)
app.use('/subscriptions', subscriptionsRoutes)
app.use('/responders', respondersRoutes)

export default app
