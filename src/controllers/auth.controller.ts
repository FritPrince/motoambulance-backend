import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
const AfricasTalking = require('africastalking')
import redis from '../lib/redis'
import prisma from '../lib/prisma'

export async function requestOtp(req: Request, res: Response) {
  const { phone } = req.body

  if (!phone) {
    return res.status(400).json({ error: 'Numéro de téléphone requis' })
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString()

  console.log(`[OTP DEV] ${phone} → ${code}`)

  await redis.setex(`otp:${phone}`, 600, code)

  const at = AfricasTalking({
    apiKey: process.env.AT_API_KEY!,
    username: process.env.AT_USERNAME!,
  })
  const result = await at.SMS.send({
    to: [phone],
    message: `Votre code MotoAmbulance : ${code}`,
  })
  console.log('[AT SMS]', JSON.stringify(result, null, 2))

  return res.json({ success: true })
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code } = req.body

  if (!phone || !code) {
    return res.status(400).json({ error: 'Téléphone et code requis' })
  }

  const stored = await redis.get(`otp:${phone}`)

  if (!stored || stored !== code) {
    return res.status(401).json({ error: 'Code invalide ou expiré' })
  }

  await redis.del(`otp:${phone}`)

  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  })

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' }
  )

  return res.json({ token, user })
}
