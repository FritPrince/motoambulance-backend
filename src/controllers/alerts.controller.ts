import { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { findNearestResponder } from '../services/dispatch.service'
import { getIo } from '../socket'
import { smsQueue } from '../queues/sms.queue'
import { sendPush } from '../services/onesignal.service'

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

    // Notifie le patient
    getIo().to(`user:${callerId}`).emit('alert:status_updated', {
      alertId: updated.id,
      status: 'ASSIGNED',
      responder: updated.responder,
    })

    // Notifie le secouriste assigné
    getIo().to(`user:${responderId}`).emit('alert:new', {
      alertId: updated.id,
      lat: updated.lat,
      lng: updated.lng,
      emergencyType: updated.emergencyType,
      triageLevel: updated.triageLevel,
      caller: { name: updated.caller.name, phone: updated.caller.phone },
    })

    try {
      await smsQueue.add({
        to: updated.caller.phone,
        message: `Un secouriste a été assigné à votre alerte. Il est en route.`,
      })
      await sendPush(callerId, 'Secouriste assigné', 'Un secouriste a été assigné à votre alerte.')
    } catch {}

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

  await sendPush(updated.callerId, 'Mise à jour de votre alerte', `Statut : ${updated.status}`)

  return res.json(updated)
}

// DELETE /alerts/:id/cancel — le patient annule sa propre alerte PENDING
export async function cancelAlert(req: Request, res: Response) {
  const id = req.params.id as string
  const userId = (req as any).user.userId

  const alert = await prisma.alert.findUnique({ where: { id } })

  if (!alert) return res.status(404).json({ error: 'Alerte introuvable' })
  if (alert.callerId !== userId) return res.status(403).json({ error: 'Accès interdit' })
  if (!['PENDING', 'ASSIGNED'].includes(alert.status)) {
    return res.status(409).json({ error: 'Impossible d\'annuler : le secouriste est déjà en route.' })
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  // Notifie le secouriste assigné s'il y en a un
  if (alert.responderId) {
    getIo().to(`user:${alert.responderId}`).emit('alert:cancelled', { alertId: id })
  }

  getIo().to(`user:${userId}`).emit('alert:status_updated', {
    alertId: updated.id,
    status: 'CANCELLED',
  })

  return res.json(updated)
}

export async function updateTriage(req: Request, res: Response) {
  const id = req.params.id as string
  const user = (req as any).user

  const parsed = updateTriageSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  const existing = await prisma.alert.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Alerte introuvable' })

  const isCaller = existing.callerId === user.userId
  const isPrivileged = user.role === 'DISPATCHER' || user.role === 'ADMIN'
  if (!isCaller && !isPrivileged) {
    return res.status(403).json({ error: 'Accès interdit' })
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
