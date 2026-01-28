import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { log, generateRequestId } from '@/lib/systemLog'
import { inngest } from '@/lib/inngest/client'

// Enqueue uploaded file for background processing
export async function POST(request: Request) {
  const requestId = generateRequestId()

  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { blobUrl, clientId, fileName, fileSize } = body

    if (!blobUrl || !clientId) {
      return NextResponse.json(
        { error: 'blobUrl and clientId are required' },
        { status: 400 }
      )
    }

    // Check if import log already exists for this blob
    let importLog = await prisma.productImportLog.findFirst({
      where: { blobUrl },
    })

    if (!importLog) {
      // Create new import log
      importLog = await prisma.productImportLog.create({
        data: {
          clientId: parseInt(clientId, 10),
          fileName: fileName || 'unknown.csv',
          fileSize: fileSize ? BigInt(fileSize) : null,
          importStatus: 'pending',
          blobUrl,
          importedBy: session.user.id,
        },
      })
    } else {
      // Update existing log
      importLog = await prisma.productImportLog.update({
        where: { id: importLog.id },
        data: {
          fileName: fileName || importLog.fileName,
          fileSize: fileSize ? BigInt(fileSize) : importLog.fileSize,
          importStatus: 'pending',
        },
      })
    }

    await log.info('product_import', 'import_enqueued', `インポートジョブをキューに登録: ${fileName}`, {
      requestId,
      clientId: parseInt(clientId, 10),
      userId: session.user.id,
      metadata: {
        importLogId: importLog.id,
        fileName,
        fileSize,
        blobUrl,
      },
    })

    // Trigger Inngest background processing
    await inngest.send({
      name: 'product/import.requested',
      data: {
        importLogId: importLog.id,
        clientId: parseInt(clientId, 10),
        fileName,
        blobUrl,
      },
    })

    await log.info('product_import', 'inngest_triggered', `Inngestバックグラウンド処理をトリガー: ${fileName}`, {
      requestId,
      clientId: parseInt(clientId, 10),
      userId: session.user.id,
      metadata: { importLogId: importLog.id },
    })

    return NextResponse.json({
      success: true,
      importLogId: importLog.id,
      message: 'インポートジョブをキューに登録しました。バックグラウンドで処理されます。',
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Enqueue error:', error)

    await log.error('product_import', 'enqueue_error', 'キュー登録エラー', err, {
      requestId,
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
