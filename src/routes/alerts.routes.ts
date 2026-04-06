import { Router } from 'express'
import { listAlerts, createAlert, getAlert, updateStatus, updateTriage } from '../controllers/alerts.controller'
import { requireAuth } from '../middlewares/auth.middleware'

const router = Router()

router.get('/', requireAuth, listAlerts)
router.post('/', requireAuth, createAlert)
router.get('/:id', requireAuth, getAlert)
router.patch('/:id/status', requireAuth, updateStatus)
router.patch('/:id/triage', requireAuth, updateTriage)

export default router
