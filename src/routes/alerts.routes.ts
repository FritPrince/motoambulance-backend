import { Router } from 'express'
import { createAlert, getAlert, updateStatus } from '../controllers/alerts.controller'
import { requireAuth } from '../middlewares/auth.middleware'

const router = Router()

router.post('/', requireAuth, createAlert)
router.get('/:id', requireAuth, getAlert)
router.patch('/:id/status', requireAuth, updateStatus)

export default router
