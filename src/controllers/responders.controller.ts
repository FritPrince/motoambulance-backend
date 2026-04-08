import { Request, Response } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'
import redis from '../lib/redis'
import { smsQueue } from '../queues/sms.queue'
import { getIo } from '../socket'
import { sendPush } from '../services/onesignal.service'

const applySchema = z.object({
  fullName: z.string().min(2, 'Nom complet requis'),
  certNumber: z.string().min(1, 'Numéro de certification requis'),
})

export async function getNearbyResponders(req: Request, res: Response) {
  const { lat, lng, radius = '20' } = req.query

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat et lng requis' })
  }

  const nearby = await redis.georadius(
    'responders:positions',
    parseFloat(lng as string),
    parseFloat(lat as string),
    parseFloat(radius as string),
    'km',
    'WITHCOORD',
    'ASC'
  ) as any[]

  const responders = await Promise.all(
    nearby.map(async ([id, [rLng, rLat]]: [string, [string, string]]) => {
      const status = await redis.get(`responder:status:${id}`)
      if (status !== 'AVAILABLE') return null
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true },
      })
      return { id, name: user?.name ?? 'Secouriste', lat: parseFloat(rLat), lng: parseFloat(rLng) }
    })
  )

  return res.json(responders.filter(Boolean))
}

export async function setResponderStatus(req: Request, res: Response) {
  const userId = (req as any).user.userId
  const { status } = req.body

  if (!['AVAILABLE', 'OFFLINE'].includes(status)) {
    return res.status(400).json({ error: 'status doit être AVAILABLE ou OFFLINE' })
  }

  if (status === 'OFFLINE') {
    await redis.del(`responder:status:${userId}`)
  } else {
    await redis.set(`responder:status:${userId}`, 'AVAILABLE')
  }

  return res.json({ status })
}

// POST /responders/apply — un patient soumet une demande
export async function applyAsResponder(req: Request, res: Response) {
  const userId = (req as any).user.userId

  const parsed = applySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  // Vérifie qu'il n'y a pas déjà une demande en attente ou approuvée
  const existing = await prisma.responderApplication.findUnique({ where: { userId } })
  if (existing) {
    if (existing.status === 'PENDING') {
      return res.status(409).json({ error: 'Vous avez déjà une demande en attente.' })
    }
    if (existing.status === 'APPROVED') {
      return res.status(409).json({ error: 'Vous êtes déjà secouriste.' })
    }
    // Si REJECTED → on permet de soumettre à nouveau (update)
    const updated = await prisma.responderApplication.update({
      where: { userId },
      data: { ...parsed.data, status: 'PENDING', reviewNote: null, reviewedBy: null },
    })
    return res.status(200).json(updated)
  }

  const application = await prisma.responderApplication.create({
    data: { userId, ...parsed.data },
  })

  return res.status(201).json(application)
}

// GET /responders/my-application — statut de la demande du patient connecté
export async function getMyApplication(req: Request, res: Response) {
  const userId = (req as any).user.userId

  const application = await prisma.responderApplication.findUnique({
    where: { userId },
  })

  if (!application) {
    return res.status(404).json({ error: 'Aucune demande trouvée' })
  }

  return res.json(application)
}

// GET /responders/applications — liste toutes les demandes (admin)
export async function listApplications(req: Request, res: Response) {
  const { status } = req.query

  const applications = await prisma.responderApplication.findMany({
    where: status ? { status: status as any } : undefined,
    include: { user: { select: { id: true, phone: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return res.json(applications)
}

// PATCH /responders/applications/:id — approuver ou rejeter (admin)
export async function reviewApplication(req: Request, res: Response) {
  const { id } = req.params
  const adminId = (req as any).user.userId

  const { decision, note } = req.body

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ error: 'decision doit être APPROVED ou REJECTED' })
  }

  const applicationId = id as string

  const application = await prisma.responderApplication.findUnique({
    where: { id: applicationId },
    include: { user: true },
  })

  if (!application) return res.status(404).json({ error: 'Demande introuvable' })
  if (application.status !== 'PENDING') {
    return res.status(409).json({ error: 'Cette demande a déjà été traitée' })
  }

  // Met à jour la demande
  const updated = await prisma.responderApplication.update({
    where: { id: applicationId },
    data: { status: decision, reviewedBy: adminId as string, reviewNote: note ?? null },
  })

  // Si approuvé → change le rôle + notifie en temps réel
  if (decision === 'APPROVED') {
    await prisma.user.update({
      where: { id: application.userId },
      data: { role: 'RESPONDER', name: application.fullName },
    })

    // Nouveau JWT avec le rôle RESPONDER
    const newToken = jwt.sign(
      { userId: application.userId, role: 'RESPONDER' },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )

    // Notifie l'app en temps réel → redirection automatique sans re-login
    const io = getIo()
    const room = io.sockets.adapter.rooms.get(`user:${application.userId}`)
    console.log(`[Dispatch] Emission vers user:${application.userId}, sockets dans la room: ${room?.size ?? 0}`)
    io.to(`user:${application.userId}`).emit('user:role_updated', {
      role: 'RESPONDER',
      token: newToken,
    })

    sendPush(application.userId, 'Candidature approuvée', `Félicitations ${application.fullName} ! Vous êtes maintenant secouriste MotoAmbulance.`).catch(() => {})
    smsQueue.add({ to: application.user.phone, message: `Félicitations ${application.fullName} ! Votre demande de secouriste MotoAmbulance a été approuvée.` }).catch(() => {})
  } else {
    sendPush(application.userId, 'Candidature non retenue', `Votre demande n'a pas été approuvée.${note ? ` Motif : ${note}` : ''} Vous pouvez soumettre une nouvelle demande.`).catch(() => {})
    smsQueue.add({ to: application.user.phone, message: `MotoAmbulance : Votre demande de secouriste n'a pas été approuvée.${note ? ` Motif : ${note}` : ''} Vous pouvez soumettre une nouvelle demande.` }).catch(() => {})
  }

  return res.json(updated)
}
