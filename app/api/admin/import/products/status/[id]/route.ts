import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// Get import progress
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
    const importLogId = parseInt(id, 10)

    if (isNaN(importLogId)) {
      return NextResponse.json({ error: 'Invalid import log ID' }, { status: 400 })
    }

    const importLog = await prisma.productImportLog.findUnique({
      where: { id: importLogId },
      include: {
        client: {
          select: {
            clientCode: true,
            clientName: true,
          },
        },
      },
    })

    if (!importLog) {
      return NextResponse.json({ error: 'Import log not found' }, { status: 404 })
    }

    // Calculate progress percentage
    const progress = importLog.totalRows && importLog.totalRows > 0
      ? Math.round((importLog.lastProcessedRow / importLog.totalRows) * 100)
      : 0

    return NextResponse.json({
      id: importLog.id,
      status: importLog.importStatus,
      fileName: importLog.fileName,
      client: importLog.client,
      totalRows: importLog.totalRows,
      lastProcessedRow: importLog.lastProcessedRow,
      insertedRows: importLog.insertedRows,
      updatedRows: importLog.updatedRows,
      errorRows: importLog.errorRows,
      progress,
      startedAt: importLog.startedAt,
      processingStartedAt: importLog.processingStartedAt,
      completedAt: importLog.completedAt,
      errorDetails: importLog.errorDetails,
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
