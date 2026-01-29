import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Client upload token generation for client users
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
    const body = await request.json() as HandleUploadBody

    // Handle Vercel Blob client upload
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB limit
          tokenPayload: JSON.stringify({
            clientId,
            userId: session.user.id,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Parse token payload
        const payload = JSON.parse(tokenPayload || '{}')
        const { clientId: cId, userId } = payload

        // Create import log with blob URL
        await prisma.productImportLog.create({
          data: {
            clientId: cId,
            fileName: blob.pathname.split('/').pop() || 'unknown.csv',
            fileSize: BigInt(0), // Will be updated during processing
            importStatus: 'pending',
            blobUrl: blob.url,
            importedBy: userId,
          },
        })
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Client upload init error:', error)

    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
