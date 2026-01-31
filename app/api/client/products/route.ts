import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user with clientId from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.clientId) {
      return NextResponse.json(
        { error: 'クライアントに紐付けられていません' },
        { status: 403 }
      )
    }

    const clientId = user.clientId

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '250', 10)))
    const search = searchParams.get('search') || ''

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {
      clientId,
      isActive: true,
    }

    if (search) {
      whereClause.OR = [
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { janCode: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get total count
    const totalCount = await prisma.productMaster.count({
      where: whereClause,
    })

    // Get paginated products
    const products = await prisma.productMaster.findMany({
      where: whereClause,
      select: {
        id: true,
        productCode: true,
        productName: true,
        costPrice: true,
        janCode: true,
        updatedAt: true,
      },
      orderBy: {
        productCode: 'asc',
      },
      skip: (page - 1) * limit,
      take: limit,
    })

    const totalPages = Math.ceil(totalCount / limit)

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    })
  } catch (error) {
    console.error('Client products API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
