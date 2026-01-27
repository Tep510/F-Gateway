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

    const clients = await prisma.client.findMany({
      orderBy: {
        clientCode: 'asc',
      },
      select: {
        id: true,
        clientCode: true,
        clientName: true,
        status: true,
        asanaEnabled: true,
        monthlyExecutionDay: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            csvUploadLogs: true,
          },
        },
      },
    })

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('Admin clients API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      clientCode,
      clientName,
      googleDriveFolderId,
      googleDriveFolderName,
      asanaProjectId,
      asanaEnabled,
      monthlyExecutionDay,
      monthlyExecutionTime,
    } = body

    if (!clientCode || !clientName) {
      return NextResponse.json(
        { error: 'Client code and name are required' },
        { status: 400 }
      )
    }

    // Check if client code already exists
    const existingClient = await prisma.client.findUnique({
      where: { clientCode },
    })

    if (existingClient) {
      return NextResponse.json(
        { error: 'Client code already exists' },
        { status: 409 }
      )
    }

    const client = await prisma.client.create({
      data: {
        clientCode,
        clientName,
        status: 'active',
        googleDriveFolderId,
        googleDriveFolderName,
        asanaProjectId,
        asanaEnabled: asanaEnabled || false,
        monthlyExecutionDay,
        monthlyExecutionTime,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    console.error('Admin clients POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
