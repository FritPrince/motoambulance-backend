import { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import redis from '../lib/redis'
import { smsQueue } from '../queues/sms.queue'

const applySchema = z.object({
  fullName: z.string().min(2, 'Nom complet requis'),
  certNumber: z.string().min(1, 'Numéro de certification requis'),
})

// GET /responders/nearby — liste les secouristes AVAILABLE avec leur position
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

  // Si approuvé → change le rôle de l'utilisateur
  if (decision === 'APPROVED') {
    await prisma.user.update({
      where: { id: application.userId },
      data: { role: 'RESPONDER', name: application.fullName },
    })

    await smsQueue.add({
      to: application.user.phone,
      message: `Félicitations ${application.fullName} ! Votre demande de secouriste MotoAmbulance a été approuvée. Reconnectez-vous pour accéder à votre espace.`,
    })
  } else {
    await smsQueue.add({
      to: application.user.phone,
      message: `MotoAmbulance : Votre demande de secouriste n'a pas été approuvée.${note ? ` Motif : ${note}` : ''} Vous pouvez soumettre une nouvelle demande.`,
    })
  }

  return res.json(updated)
}
