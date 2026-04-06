import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requestOtp, verifyOtp } from '../controllers/auth.controller'

const router = Router()

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: { error: 'Trop de tentatives, réessayez dans 10 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/request-otp', otpLimiter, requestOtp)
router.post('/verify-otp', verifyOtp)

export default router
