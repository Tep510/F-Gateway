import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.user.clientId) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const clientId = parseInt(session.user.clientId)

    // Get client information
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        clientCode: true,
        clientName: true,
        status: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get this month's statistics
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const csvUploadLogs = await prisma.csvUploadLog.findMany({
      where: {
        clientId,
        uploadedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        uploadStatus: true,
        uploadedAt: true,
      },
    })

    const totalDays = csvUploadLogs.length
    const successDays = csvUploadLogs.filter(log => log.uploadStatus === 'success').length
    const errorDays = csvUploadLogs.filter(log => log.uploadStatus === 'error').length

    // Get latest item master sync
    const latestItemSync = await prisma.clientItemSyncSetting.findUnique({
      where: { clientId },
      select: {
        lastSyncAt: true,
        syncEnabled: true,
      },
    })

    // Get product import logs for the month
    const productImportLogs = await prisma.productImportLog.findMany({
      where: {
        clientId,
        startedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        importStatus: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: {
        startedAt: 'desc',
      },
    })

    // Get latest product import
    const latestProductImport = productImportLogs.length > 0 ? productImportLogs[0] : null

    return NextResponse.json({
      client,
      monthlySummary: {
        totalDays,
        successDays,
        errorDays,
      },
      itemMasterSync: {
        lastSyncAt: latestItemSync?.lastSyncAt || null,
        syncEnabled: latestItemSync?.syncEnabled || false,
      },
      productImport: {
        lastImportAt: latestProductImport?.completedAt || latestProductImport?.startedAt || null,
        importLogs: productImportLogs.map(log => ({
          date: log.startedAt.toISOString().split('T')[0],
          status: log.importStatus,
        })),
      },
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
