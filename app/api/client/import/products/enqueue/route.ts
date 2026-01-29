import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'

// Enqueue uploaded file for background processing (client users)
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user with clientId from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { client: true },
    })

    if (!user?.clientId || !user.client) {
      return NextResponse.json(
        { error: 'クライアントに紐付けられていません' },
        { status: 403 }
      )
    }

    const clientId = user.clientId
    const body = await request.json()
    const { blobUrl, fileName, fileSize } = body

    if (!blobUrl) {
      return NextResponse.json(
        { error: 'blobUrl is required' },
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
          clientId,
          fileName: fileName || 'unknown.csv',
          fileSize: fileSize ? BigInt(fileSize) : null,
          importStatus: 'pending',
          blobUrl,
          importedBy: session.user.id,
        },
      })
    } else {
      // Verify this import belongs to the user's client
      if (importLog.clientId !== clientId) {
        return NextResponse.json(
          { error: 'このインポートにアクセスする権限がありません' },
          { status: 403 }
        )
      }

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

    // Trigger Inngest background processing
    await inngest.send({
      name: 'product/import.requested',
      data: {
        importLogId: importLog.id,
        clientId,
        fileName,
        blobUrl,
      },
    })

    return NextResponse.json({
      success: true,
      importLogId: importLog.id,
      message: 'インポートジョブをキューに登録しました。バックグラウンドで処理されます。',
    })
  } catch (error) {
    console.error('Client enqueue error:', error)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
