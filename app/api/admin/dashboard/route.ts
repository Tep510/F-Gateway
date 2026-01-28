import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get total counts
    const [totalClients, activeClients, totalUsers] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: 'active' } }),
    ])

    // Get today's activity
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [todayUploads, todayTransfers, todayNotifications] = await Promise.all([
      prisma.csvUploadLog.findMany({
        where: {
          uploadedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          client: {
            select: {
              clientCode: true,
              clientName: true,
            },
          },
        },
        orderBy: {
          uploadedAt: 'desc',
        },
        take: 10,
      }),
      prisma.fileTransfer.findMany({
        where: {
          startedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          client: {
            select: {
              clientCode: true,
              clientName: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
        take: 10,
      }),
      prisma.asanaNotification.count({
        where: {
          sentAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
    ])

    // Get client status for today
    const clientsWithActivity = await prisma.client.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        clientCode: true,
        clientName: true,
        csvUploadLogs: {
          where: {
            uploadedAt: {
              gte: today,
              lt: tomorrow,
            },
          },
          select: {
            uploadStatus: true,
            uploadedAt: true,
          },
        },
        fileTransfers: {
          where: {
            startedAt: {
              gte: today,
              lt: tomorrow,
            },
          },
          select: {
            transferStatus: true,
            startedAt: true,
          },
        },
      },
    })

    return NextResponse.json({
      summary: {
        totalClients,
        activeClients,
        totalUsers,
        todayNotifications,
      },
      recentActivity: {
        uploads: todayUploads,
        transfers: todayTransfers,
      },
      clientsToday: clientsWithActivity,
    })
  } catch (error) {
    console.error('Admin dashboard API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
