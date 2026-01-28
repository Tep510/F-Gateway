import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
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

    const products = await prisma.productMaster.findMany({
      where: {
        clientId,
        isActive: true,
      },
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
    })

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Client products API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
