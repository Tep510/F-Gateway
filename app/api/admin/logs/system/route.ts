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

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const level = searchParams.get('level') // debug, info, warn, error
    const category = searchParams.get('category')
    const clientId = searchParams.get('clientId')
    const requestId = searchParams.get('requestId')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')

    // Build where clause
    const where: any = {}

    if (level) {
      where.logLevel = level
    }

    if (category) {
      where.category = category
    }

    if (clientId) {
      where.clientId = parseInt(clientId)
    }

    if (requestId) {
      where.requestId = requestId
    }

    if (fromDate || toDate) {
      where.createdAt = {}
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate)
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate)
      }
    }

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.systemLog.count({ where }),
    ])

    // Get category counts for filter UI
    const categoryCounts = await prisma.systemLog.groupBy({
      by: ['category'],
      _count: true,
      where: fromDate || toDate ? {
        createdAt: where.createdAt
      } : undefined,
    })

    const levelCounts = await prisma.systemLog.groupBy({
      by: ['logLevel'],
      _count: true,
      where: fromDate || toDate ? {
        createdAt: where.createdAt
      } : undefined,
    })

    return NextResponse.json({
      logs,
      total,
      pagination: {
        limit,
        offset,
        hasMore: offset + logs.length < total,
      },
      stats: {
        categories: categoryCounts.reduce((acc, item) => {
          acc[item.category] = item._count
          return acc
        }, {} as Record<string, number>),
        levels: levelCounts.reduce((acc, item) => {
          acc[item.logLevel] = item._count
          return acc
        }, {} as Record<string, number>),
      },
    })
  } catch (error) {
    console.error('System logs API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
