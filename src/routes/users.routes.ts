import { Router, Request, Response } from 'express'
import { requireAuth } from '../middlewares/auth.middleware'
import redis from '../lib/redis'

const router = Router()

router.post('/push-token', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'token requis' })
  await redis.set(`push-token:${userId}`, token)
  return res.json({ ok: true })
})

export default router
