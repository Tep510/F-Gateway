import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
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
    const clientId = parseInt(id)

    const mapping = await prisma.clientProductColumnMapping.findUnique({
      where: { clientId },
    })

    if (!mapping) {
      return NextResponse.json({ mapping: null })
    }

    return NextResponse.json({
      mapping: {
        sampleHeaders: mapping.sampleHeaders as string[],
        columnMappings: mapping.columnMappings as Record<string, number | null>,
        totalColumns: mapping.totalColumns,
        isConfigured: mapping.isConfigured,
        sampleFileName: mapping.sampleFileName,
      },
    })
  } catch (error) {
    console.error('Column mapping GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
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
    const clientId = parseInt(id)
    const body = await request.json()

    const { sampleHeaders, columnMappings, sampleFileName } = body

    // Validate required fields
    if (!sampleHeaders || !Array.isArray(sampleHeaders)) {
      return NextResponse.json(
        { error: 'sampleHeaders is required' },
        { status: 400 }
      )
    }

    if (!columnMappings || typeof columnMappings !== 'object') {
      return NextResponse.json(
        { error: 'columnMappings is required' },
        { status: 400 }
      )
    }

    // Check required system fields are mapped
    const requiredFields = ['productCode', 'janCode']
    for (const field of requiredFields) {
      if (columnMappings[field] === undefined || columnMappings[field] === null) {
        return NextResponse.json(
          { error: `必須項目 ${field} がマッピングされていません` },
          { status: 400 }
        )
      }
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Upsert the mapping
    const mapping = await prisma.clientProductColumnMapping.upsert({
      where: { clientId },
      create: {
        clientId,
        sampleHeaders,
        columnMappings,
        sampleFileName: sampleFileName || null,
        totalColumns: sampleHeaders.length,
        isConfigured: true,
        configuredBy: session.user.email || null,
      },
      update: {
        sampleHeaders,
        columnMappings,
        sampleFileName: sampleFileName || null,
        totalColumns: sampleHeaders.length,
        isConfigured: true,
        configuredBy: session.user.email || null,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      mapping: {
        sampleHeaders: mapping.sampleHeaders as string[],
        columnMappings: mapping.columnMappings as Record<string, number | null>,
        totalColumns: mapping.totalColumns,
        isConfigured: mapping.isConfigured,
        sampleFileName: mapping.sampleFileName,
      },
    })
  } catch (error) {
    console.error('Column mapping POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
