import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { findNearestResponder } from '../services/dispatch.service'
import { getIo } from '../socket'
import { smsQueue } from '../queues/sms.queue'

export async function createAlert(req: Request, res: Response) {
  const { lat, lng, emergencyType } = req.body
  const callerId = (req as any).user.userId

  const alert = await prisma.alert.create({
    data: { callerId, lat, lng, emergencyType },
  })

  const responderId = await findNearestResponder(lat, lng)

  if (responderId) {
    const updated = await prisma.alert.update({
      where: { id: alert.id },
      data: { responderId, status: 'ASSIGNED' },
      include: { responder: true, caller: true },
    })

    await smsQueue.add({
      to: updated.caller.phone,
      message: `Un secouriste a été assigné à votre alerte. Il est en route.`,
    })

    return res.status(201).json(updated)
  }

  return res.status(201).json(alert)
}

export async function getAlert(req: Request, res: Response) {
  const id = req.params.id as string

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { caller: true, responder: true },
  })

  if (!alert) {
    return res.status(404).json({ error: 'Alerte introuvable' })
  }

  return res.json(alert)
}

export async function updateStatus(req: Request, res: Response) {
  const id = req.params.id as string
  const { status } = req.body

  const alert = await prisma.alert.update({
    where: { id },
    data: { status },
    include: { responder: true },
  })

  getIo().to(`user:${alert.callerId}`).emit('alert:status_updated', {
    alertId: alert.id,
    status: alert.status,
    responder: alert.responder,
  })

  return res.json(alert)
}
