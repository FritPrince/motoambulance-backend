import { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { findNearestResponder } from '../services/dispatch.service'
import { getIo } from '../socket'
import { smsQueue } from '../queues/sms.queue'
import { notificationQueue } from '../queues/notification.queue'

const createAlertSchema = z.object({
  lat: z.number({ error: 'lat requis' }),
  lng: z.number({ error: 'lng requis' }),
  emergencyType: z.string().min(1, 'emergencyType requis'),
})

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'ENROUTE', 'ONSITE', 'CLOSED', 'CANCELLED']),
})

const updateTriageSchema = z.object({
  triageLevel: z.enum(['PENDING', 'CRITICAL', 'URGENT', 'STABLE']),
})

export async function listAlerts(req: Request, res: Response) {
  const user = (req as any).user

  // Les patients voient uniquement leurs propres alertes
  // Les dispatchers/admins voient toutes les alertes
  // Les responders voient les alertes qui leur sont assignées
  let where: any = {}
  if (user.role === 'PATIENT') {
    where.callerId = user.userId
  } else if (user.role === 'RESPONDER') {
    where.responderId = user.userId
  }

  const alerts = await prisma.alert.findMany({
    where,
    include: { caller: true, responder: true },
    orderBy: { createdAt: 'desc' },
  })

  return res.json(alerts)
}

export async function createAlert(req: Request, res: Response) {
  const parsed = createAlertSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  const { lat, lng, emergencyType } = parsed.data
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

    await notificationQueue.add({
      userId: callerId,
      title: 'Secouriste assigné',
      body: 'Un secouriste a été assigné à votre alerte.',
    })

    return res.status(201).json(updated)
  }

  return res.status(201).json(alert)
}

export async function getAlert(req: Request, res: Response) {
  const id = req.params.id as string
  const user = (req as any).user

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { caller: true, responder: true },
  })

  if (!alert) {
    return res.status(404).json({ error: 'Alerte introuvable' })
  }

  const isOwner = alert.callerId === user.userId || alert.responderId === user.userId
  const isPrivileged = user.role === 'DISPATCHER' || user.role === 'ADMIN'

  if (!isOwner && !isPrivileged) {
    return res.status(403).json({ error: 'Accès interdit' })
  }

  return res.json(alert)
}

export async function updateStatus(req: Request, res: Response) {
  const id = req.params.id as string
  const user = (req as any).user

  const parsed = updateStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  const alert = await prisma.alert.findUnique({ where: { id } })
  if (!alert) return res.status(404).json({ error: 'Alerte introuvable' })

  const isAssignedResponder = alert.responderId === user.userId
  const isPrivileged = user.role === 'DISPATCHER' || user.role === 'ADMIN'
  const isCaller = alert.callerId === user.userId

  // Un patient peut uniquement annuler sa propre alerte si elle est encore PENDING
  const isSelfCancel =
    isCaller &&
    parsed.data.status === 'CANCELLED' &&
    alert.status === 'PENDING'

  if (!isAssignedResponder && !isPrivileged && !isSelfCancel) {
    return res.status(403).json({ error: 'Accès interdit' })
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { status: parsed.data.status },
    include: { responder: true },
  })

  getIo().to(`user:${updated.callerId}`).emit('alert:status_updated', {
    alertId: updated.id,
    status: updated.status,
    responder: updated.responder,
  })

  try {
    await notificationQueue.add({
      userId: updated.callerId,
      title: 'Mise à jour de votre alerte',
      body: `Statut : ${updated.status}`,
    })
  } catch {}

  return res.json(updated)
}

export async function updateTriage(req: Request, res: Response) {
  const id = req.params.id as string
  const user = (req as any).user

  if (user.role !== 'DISPATCHER' && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Réservé aux dispatchers' })
  }

  const parsed = updateTriageSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  const alert = await prisma.alert.update({
    where: { id },
    data: { triageLevel: parsed.data.triageLevel },
  })

  getIo().to(`user:${alert.callerId}`).emit('alert:triage_updated', {
    alertId: alert.id,
    triageLevel: alert.triageLevel,
  })

  return res.json(alert)
}
