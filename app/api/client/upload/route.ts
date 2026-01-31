import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import iconv from 'iconv-lite'
import { uploadCsvToDrive, isDriveConfigured } from '@/lib/google-drive'
import { log, generateRequestId } from '@/lib/systemLog'

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
  const requestId = generateRequestId()

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

    // Generate new filename with timestamp (YYYYMMDDHHMM format)
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const timestamp = `${year}${month}${day}${hour}${minute}`
    const prefix = uploadType === 'shipping' ? 'OUT' : 'IN'
    const newFileName = `${prefix}_${user.client.clientCode}_${timestamp}.csv`

    await log.info('csv_upload', 'upload_start', `CSVアップロード開始: ${file.name} -> ${newFileName}`, {
      clientId,
      userId: user.id,
      requestId,
      metadata: {
        originalFileName: file.name,
        newFileName,
        uploadType,
        fileSize: file.size,
        rowCount,
        encoding,
      },
    })

    // Check if Google Drive is configured
    const driveConfig = await isDriveConfigured()
    let googleDriveFileId = `local_${timestamp}` // Default if Drive not configured
    let driveUploadSuccess = false
    let driveUploadError: string | undefined

    if (driveConfig.configured) {
      // Upload to Google Drive (creates client subfolder: {folderType}/{clientCode}/)
      const driveResult = await uploadCsvToDrive(
        newFileName,
        buffer, // Upload original buffer to preserve encoding
        uploadType as 'shipping' | 'receiving',
        clientId,
        user.client.clientCode,
        requestId
      )

      if (driveResult.success && driveResult.fileId) {
        googleDriveFileId = driveResult.fileId
        driveUploadSuccess = true
      } else {
        driveUploadError = driveResult.error
        // Log warning but don't fail the upload - save to DB anyway
        await log.warn('csv_upload', 'drive_upload_failed', `Google Driveアップロード失敗、ローカル保存のみ: ${newFileName}`, {
          clientId,
          requestId,
          metadata: { error: driveResult.error },
        })
      }
    } else {
      await log.warn('csv_upload', 'drive_not_configured', 'Google Driveが未設定のためローカル保存のみ', {
        clientId,
        requestId,
        metadata: {
          hasCredentials: driveConfig.hasCredentials,
          initialized: driveConfig.initialized,
        },
      })
    }

    // Save upload log to database
    const uploadLog = await prisma.csvUploadLog.create({
      data: {
        clientId,
        googleDriveFileId,
        fileName: newFileName,
        fileSize: BigInt(file.size),
        rowCount,
        uploadStatus: driveUploadSuccess ? 'completed' : 'pending_transfer',
        errorMessage: driveUploadError || null,
      },
    })

    // Record file transfer if Drive upload was successful
    if (driveUploadSuccess) {
      await prisma.fileTransfer.create({
        data: {
          clientId,
          sourceFileId: `upload_${uploadLog.id}`,
          targetFileId: googleDriveFileId,
          transferStatus: 'completed',
          transferType: uploadType === 'shipping' ? 'shipping_plan' : 'receiving_plan',
        },
      })
    }

    await log.info('csv_upload', 'upload_complete', `CSVアップロード完了: ${newFileName}`, {
      clientId,
      requestId,
      metadata: {
        uploadId: uploadLog.id,
        googleDriveFileId,
        driveUploadSuccess,
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
      googleDriveFileId: driveUploadSuccess ? googleDriveFileId : null,
      driveUploadSuccess,
      message: driveUploadSuccess
        ? `${uploadType === 'shipping' ? '出庫予定' : '入庫予定'}CSVをGoogle Driveにアップロードしました`
        : `${uploadType === 'shipping' ? '出庫予定' : '入庫予定'}CSVを保存しました（Google Drive転送は保留中）`,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('CSV upload error:', err)

    await log.error('csv_upload', 'upload_error', 'CSVアップロードエラー', err, {
      requestId,
    })

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

    // Support both old (shukka_/nyuka_) and new (OUT_/IN_) prefixes
    const shippingPrefixes = ['OUT_', 'shukka_']
    const receivingPrefixes = ['IN_', 'nyuka_']

    const logs = await prisma.csvUploadLog.findMany({
      where: {
        clientId: user.clientId,
        ...(type && {
          OR: (type === 'shipping' ? shippingPrefixes : receivingPrefixes).map(prefix => ({
            fileName: { startsWith: prefix }
          })),
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
        googleDriveFileId: log.googleDriveFileId.startsWith('local_') || log.googleDriveFileId.startsWith('pending_')
          ? null
          : log.googleDriveFileId,
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
