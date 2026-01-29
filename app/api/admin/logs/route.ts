import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

// Convert BigInt to Number and preserve Date for JSON serialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeForJson(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(serializeForJson)
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const key in obj) {
      result[key] = serializeForJson(obj[key])
    }
    return result
  }
  return obj
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const logType = searchParams.get('type') || 'all'
    const clientId = searchParams.get('clientId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const whereClause = clientId ? { clientId: parseInt(clientId) } : {}

    let logs: any = {}

    if (logType === 'all' || logType === 'csv_upload') {
      logs.csvUploads = await prisma.csvUploadLog.findMany({
        where: whereClause,
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
        take: limit,
        skip: offset,
      })
    }

    if (logType === 'all' || logType === 'csv_conversion') {
      logs.csvConversions = await prisma.csvConversionLog.findMany({
        where: whereClause,
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
        take: limit,
        skip: offset,
      })
    }

    if (logType === 'all' || logType === 'file_transfer') {
      logs.fileTransfers = await prisma.fileTransfer.findMany({
        where: whereClause,
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
        take: limit,
        skip: offset,
      })
    }

    if (logType === 'all' || logType === 'asana_notification') {
      logs.asanaNotifications = await prisma.asanaNotification.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              clientCode: true,
              clientName: true,
            },
          },
        },
        orderBy: {
          sentAt: 'desc',
        },
        take: limit,
        skip: offset,
      })
    }

    if (logType === 'all' || logType === 'item_import') {
      logs.itemImports = await prisma.itemImportLog.findMany({
        where: whereClause,
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
        take: limit,
        skip: offset,
      })
    }

    if (logType === 'all' || logType === 'product_import') {
      logs.productImports = await prisma.productImportLog.findMany({
        where: whereClause,
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
        take: limit,
        skip: offset,
      })
    }

    // Convert BigInt values to numbers for JSON serialization
    return NextResponse.json({ logs: serializeForJson(logs) })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Admin logs API error:', err.message, err.stack)
    return NextResponse.json(
      { error: `ログ取得エラー: ${err.message}` },
      { status: 500 }
    )
  }
}
