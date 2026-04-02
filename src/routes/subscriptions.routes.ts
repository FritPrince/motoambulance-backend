import { Router } from 'express'
import { createSubscription, handleWebhook } from '../controllers/subscriptions.controller'
import { requireAuth } from '../middlewares/auth.middleware'

const router = Router()

router.post('/', requireAuth, createSubscription)
router.post('/webhook', handleWebhook)

export default router
