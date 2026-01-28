import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const userId = id
    const body = await request.json()

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...body,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Admin user PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const userId = id

    // Soft delete by setting status to 'inactive'
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'inactive',
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Admin user DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
