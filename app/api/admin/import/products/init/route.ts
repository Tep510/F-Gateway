import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { log, generateRequestId } from '@/lib/systemLog'

// Client upload token generation
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

    const body = await request.json() as HandleUploadBody

    // Handle Vercel Blob client upload
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Extract clientId from pathname (format: products/{clientId}/{filename})
        const parts = pathname.split('/')
        const clientIdStr = parts[1]
        const clientId = parseInt(clientIdStr, 10)

        if (isNaN(clientId)) {
          throw new Error('Invalid clientId in pathname')
        }

        // Verify client exists
        const client = await prisma.client.findUnique({
          where: { id: clientId },
        })

        if (!client) {
          throw new Error('Client not found')
        }

        await log.info('product_import', 'upload_token_generated', `アップロードトークン発行: ${pathname}`, {
          requestId,
          clientId,
          userId: session.user.id,
          metadata: { pathname },
        })

        return {
          allowedContentTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB limit
          tokenPayload: JSON.stringify({
            clientId,
            userId: session.user.id,
            requestId,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Parse token payload
        const payload = JSON.parse(tokenPayload || '{}')
        const { clientId, userId, requestId: reqId } = payload

        // Create import log with blob URL
        const importLog = await prisma.productImportLog.create({
          data: {
            clientId,
            fileName: blob.pathname.split('/').pop() || 'unknown.csv',
            fileSize: BigInt(0), // Will be updated during processing
            importStatus: 'pending',
            blobUrl: blob.url,
            importedBy: userId,
          },
        })

        await log.info('product_import', 'upload_completed', `ファイルアップロード完了: ${blob.pathname}`, {
          requestId: reqId,
          clientId,
          userId,
          metadata: {
            blobUrl: blob.url,
            importLogId: importLog.id,
          },
        })
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Upload init error:', error)

    await log.error('product_import', 'upload_init_error', 'アップロード初期化エラー', err, {
      requestId,
    })

    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
