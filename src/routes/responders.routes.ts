import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware'
import { requireRole } from '../middlewares/requireRole.middleware'
import {
  applyAsResponder,
  getMyApplication,
  listApplications,
  reviewApplication,
} from '../controllers/responders.controller'

const router = Router()

// Routes patient
router.post('/apply', requireAuth, applyAsResponder)
router.get('/my-application', requireAuth, getMyApplication)

// Routes admin uniquement
router.get('/applications', requireAuth, requireRole('ADMIN'), listApplications)
router.patch('/applications/:id', requireAuth, requireRole('ADMIN'), reviewApplication)

export default router
