import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.user.clientId) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const clientId = parseInt(session.user.clientId)

    // Get year and month from query params
    const searchParams = request.nextUrl.searchParams
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0)

    // Get CSV upload logs for the month
    const uploadLogs = await prisma.csvUploadLog.findMany({
      where: {
        clientId,
        uploadedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        uploadedAt: 'asc',
      },
      select: {
        id: true,
        fileName: true,
        uploadStatus: true,
        uploadedAt: true,
      },
    })

    // Get file transfers for the month
    const transfers = await prisma.fileTransfer.findMany({
      where: {
        clientId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        startedAt: 'asc',
      },
      select: {
        id: true,
        transferType: true,
        transferStatus: true,
        startedAt: true,
      },
    })

    // Group by date
    const historyMap = new Map<string, any>()

    uploadLogs.forEach(log => {
      const dateKey = log.uploadedAt.toISOString().split('T')[0]
      if (!historyMap.has(dateKey)) {
        historyMap.set(dateKey, {
          date: dateKey,
          uploads: [],
          transfers: [],
        })
      }
      historyMap.get(dateKey).uploads.push({
        fileName: log.fileName,
        status: log.uploadStatus,
      })
    })

    transfers.forEach(transfer => {
      const dateKey = transfer.startedAt.toISOString().split('T')[0]
      if (!historyMap.has(dateKey)) {
        historyMap.set(dateKey, {
          date: dateKey,
          uploads: [],
          transfers: [],
        })
      }
      historyMap.get(dateKey).transfers.push({
        type: transfer.transferType,
        status: transfer.transferStatus,
      })
    })

    const history = Array.from(historyMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    )

    return NextResponse.json({
      year,
      month,
      history,
    })
  } catch (error) {
    console.error('History API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
