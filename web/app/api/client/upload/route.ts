import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import iconv from 'iconv-lite'

function detectEncoding(buffer: Buffer): string {
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8'
  }
  let sjisScore = 0
  let utf8Score = 0

  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    const byte = buffer[i]
    if (byte >= 0x81 && byte <= 0x9F) sjisScore++
    if (byte >= 0xE0 && byte <= 0xEF) sjisScore++
    if (byte >= 0xC0 && byte <= 0xDF && buffer[i + 1] >= 0x80) utf8Score++
  }

  return sjisScore > utf8Score ? 'Shift_JIS' : 'utf-8'
}

function countCsvRows(content: string): number {
  const lines = content.split(/\r?\n/).filter(line => line.trim())
  return Math.max(0, lines.length - 1) // Exclude header row
}

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

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const uploadType = formData.get('type') as string | null // 'shipping' or 'receiving'

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが必要です' },
        { status: 400 }
      )
    }

    if (!uploadType || !['shipping', 'receiving'].includes(uploadType)) {
      return NextResponse.json(
        { error: 'アップロードタイプが不正です' },
        { status: 400 }
      )
    }

    // Read and decode file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const encoding = detectEncoding(buffer)
    const content = iconv.decode(buffer, encoding)

    // Count rows
    const rowCount = countCsvRows(content)

    // Generate new filename with timestamp
    const now = new Date()
    const timestamp = now.toISOString().replace(/-/g, '').replace(/:/g, '').replace(/T/g, '').slice(0, 14)
    const prefix = uploadType === 'shipping' ? 'shukka' : 'nyuka'
    const newFileName = `${prefix}_${user.client.clientCode}_${timestamp}.csv`

    // For now, save upload log to database
    // TODO: Upload to Google Drive
    const uploadLog = await prisma.csvUploadLog.create({
      data: {
        clientId,
        googleDriveFileId: `pending_${timestamp}`, // Placeholder until Google Drive integration
        fileName: newFileName,
        fileSize: BigInt(file.size),
        rowCount,
        uploadStatus: 'completed',
      },
    })

    return NextResponse.json({
      success: true,
      uploadId: uploadLog.id,
      originalFileName: file.name,
      newFileName,
      rowCount,
      fileSize: file.size,
      encoding,
      uploadType,
      message: `${uploadType === 'shipping' ? '出庫' : '入庫'}CSVをアップロードしました`,
    })
  } catch (error) {
    console.error('CSV upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get upload history
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.clientId) {
      return NextResponse.json(
        { error: 'クライアントに紐付けられていません' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // 'shipping' or 'receiving'

    const logs = await prisma.csvUploadLog.findMany({
      where: {
        clientId: user.clientId,
        ...(type && {
          fileName: {
            startsWith: type === 'shipping' ? 'shukka_' : 'nyuka_',
          },
        }),
      },
      orderBy: {
        uploadedAt: 'desc',
      },
      take: 50,
    })

    return NextResponse.json({
      logs: logs.map(log => ({
        id: log.id,
        fileName: log.fileName,
        fileSize: Number(log.fileSize),
        rowCount: log.rowCount,
        status: log.uploadStatus,
        uploadedAt: log.uploadedAt.toISOString(),
        errorMessage: log.errorMessage,
      })),
    })
  } catch (error) {
    console.error('Get upload logs error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
