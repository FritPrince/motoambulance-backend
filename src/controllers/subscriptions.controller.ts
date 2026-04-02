import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { createTransaction } from '../services/payment.service'

export async function createSubscription(req: Request, res: Response) {
  const { plan } = req.body
  const userId = (req as any).user.userId

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

  const { transactionId, paymentUrl } = await createTransaction(plan, user.phone)

  const subscription = await prisma.subscription.create({
    data: { userId, plan, fedapayId: String(transactionId) },
  })

  return res.status(201).json({ subscription, paymentUrl })
}

export async function handleWebhook(req: Request, res: Response) {
  const event = req.body

  if (event.name === 'transaction.approved') {
    const fedapayId = String(event.entity.id)

    await prisma.subscription.updateMany({
      where: { fedapayId },
      data: {
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  return res.json({ received: true })
}
