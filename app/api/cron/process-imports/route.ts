import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { log, generateRequestId } from '@/lib/systemLog'
import iconv from 'iconv-lite'

// Configuration
const BATCH_SIZE = 5000 // Rows per batch
const MAX_EXECUTION_TIME = 50000 // 50 seconds (leave 10s buffer for Vercel's 60s limit)

// Cron job for processing large CSV imports
// Vercel Cron: runs every minute
export async function GET(request: Request) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without secret
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Find pending or processing import jobs
    const pendingJobs = await prisma.productImportLog.findMany({
      where: {
        importStatus: {
          in: ['pending', 'processing'],
        },
        blobUrl: {
          not: null,
        },
      },
      orderBy: {
        startedAt: 'asc',
      },
      take: 1, // Process one job at a time
    })

    if (pendingJobs.length === 0) {
      return NextResponse.json({ message: 'No pending jobs' })
    }

    const job = pendingJobs[0]

    await log.info('product_import', 'cron_job_start', `Cronジョブ開始: ImportLog #${job.id}`, {
      requestId,
      clientId: job.clientId,
      metadata: {
        importLogId: job.id,
        fileName: job.fileName,
        lastProcessedRow: job.lastProcessedRow,
      },
    })

    // Fetch CSV from Blob
    const response = await fetch(job.blobUrl!)
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Detect and decode encoding
    const encoding = detectEncoding(buffer)
    let content = iconv.decode(buffer, encoding)

    // Normalize line endings (handle CR, LF, CRLF)
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // Parse CSV
    const rows = parseCSV(content)
    const totalRows = rows.length - 1 // Exclude header

    if (totalRows <= 0) {
      await prisma.productImportLog.update({
        where: { id: job.id },
        data: {
          importStatus: 'failed',
          errorDetails: [{ error: 'CSV file is empty or has no data rows' }],
          completedAt: new Date(),
        },
      })
      return NextResponse.json({ error: 'Empty CSV' })
    }

    // Update job status
    if (job.importStatus === 'pending') {
      await prisma.productImportLog.update({
        where: { id: job.id },
        data: {
          importStatus: 'processing',
          totalRows,
          encoding,
          fileSize: BigInt(buffer.length),
          processingStartedAt: new Date(),
        },
      })
    }

    // Get column mapping
    const savedMapping = await prisma.clientProductColumnMapping.findUnique({
      where: { clientId: job.clientId },
    })

    // Map headers
    const headers = rows[0]
    const columnIndices = getColumnIndices(headers, savedMapping)

    if (!('productCode' in columnIndices)) {
      await prisma.productImportLog.update({
        where: { id: job.id },
        data: {
          importStatus: 'failed',
          errorDetails: [{ error: '商品コードカラムが見つかりません' }],
          completedAt: new Date(),
        },
      })
      return NextResponse.json({ error: 'Product code column not found' })
    }

    // Process rows in batch
    const startRow = job.lastProcessedRow + 1 // 1-indexed (skip header)
    const endRow = Math.min(startRow + BATCH_SIZE - 1, totalRows)

    let insertedRows = job.insertedRows || 0
    let updatedRows = job.updatedRows || 0
    let errorRows = job.errorRows || 0
    const errors: { row: number; error: string }[] = (job.errorDetails as any[]) || []

    for (let i = startRow; i <= endRow; i++) {
      // Check execution time
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        // Save progress and exit
        await prisma.productImportLog.update({
          where: { id: job.id },
          data: {
            lastProcessedRow: i - 1,
            insertedRows,
            updatedRows,
            errorRows,
            errorDetails: errors.length > 0 ? errors.slice(-100) : undefined,
          },
        })

        await log.info('product_import', 'cron_job_timeout', `Cronジョブタイムアウト（続行予定）: ${i - 1}/${totalRows}`, {
          requestId,
          clientId: job.clientId,
          durationMs: Date.now() - startTime,
          metadata: {
            importLogId: job.id,
            processedRows: i - 1,
            totalRows,
          },
        })

        return NextResponse.json({
          message: 'Timeout - will continue in next run',
          progress: i - 1,
          total: totalRows,
        })
      }

      const row = rows[i]
      try {
        const productData = parseRow(row, columnIndices, job.clientId, job.id)

        if (!productData.productCode) {
          errors.push({ row: i + 1, error: '商品コードが空です' })
          errorRows++
          continue
        }

        const existing = await prisma.productMaster.findUnique({
          where: {
            clientId_productCode: {
              clientId: job.clientId,
              productCode: productData.productCode,
            },
          },
        })

        if (existing) {
          await prisma.productMaster.update({
            where: { id: existing.id },
            data: productData,
          })
          updatedRows++
        } else {
          await prisma.productMaster.create({
            data: productData,
          })
          insertedRows++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ row: i + 1, error: message })
        errorRows++
      }
    }

    // Check if completed
    const isCompleted = endRow >= totalRows

    await prisma.productImportLog.update({
      where: { id: job.id },
      data: {
        lastProcessedRow: endRow,
        insertedRows,
        updatedRows,
        errorRows,
        errorDetails: errors.length > 0 ? errors.slice(-100) : undefined,
        ...(isCompleted ? {
          importStatus: errorRows > 0 && insertedRows + updatedRows === 0 ? 'failed' : 'completed',
          completedAt: new Date(),
        } : {}),
      },
    })

    // Delete blob if completed
    if (isCompleted && job.blobUrl) {
      try {
        await del(job.blobUrl)
        await log.info('product_import', 'blob_deleted', `Blobファイル削除: ${job.fileName}`, {
          requestId,
          clientId: job.clientId,
        })
      } catch (delError) {
        console.error('Failed to delete blob:', delError)
      }
    }

    const durationMs = Date.now() - startTime

    await log.info('product_import', isCompleted ? 'cron_job_complete' : 'cron_job_progress',
      isCompleted
        ? `Cronジョブ完了: ${job.fileName}`
        : `Cronジョブ進行中: ${endRow}/${totalRows}`, {
      requestId,
      clientId: job.clientId,
      durationMs,
      metadata: {
        importLogId: job.id,
        processedRows: endRow,
        totalRows,
        insertedRows,
        updatedRows,
        errorRows,
        isCompleted,
      },
    })

    return NextResponse.json({
      message: isCompleted ? 'Import completed' : 'Batch processed',
      importLogId: job.id,
      progress: endRow,
      total: totalRows,
      insertedRows,
      updatedRows,
      errorRows,
      isCompleted,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Cron job error:', error)

    await log.error('product_import', 'cron_job_error', 'Cronジョブエラー', err, {
      requestId,
      durationMs: Date.now() - startTime,
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper functions

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

function parseCSV(content: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\n') {
        currentRow.push(currentField)
        if (currentRow.some(f => f.trim())) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow)
    }
  }

  return rows
}

const DEFAULT_COLUMN_MAP: Record<string, string> = {
  '商品コード': 'productCode',
  '商品名': 'productName',
  '仕入先コード': 'supplierCode',
  '仕入先名': 'supplierName',
  '在庫数': 'stockQuantity',
  '引当数': 'allocatedQuantity',
  'フリー在庫数': 'freeStockQuantity',
  '不良在庫数': 'defectiveStockQuantity',
  '欠品数': 'shortageQuantity',
  '発注残数': 'orderRemainingQuantity',
  '商品区分': 'productCategory',
  '商品タグ': 'productTag',
  '取扱区分': 'handlingCategory',
  '適正在庫数': 'optimalStockQuantity',
  '発注点': 'orderPoint',
  'ロット': 'lotSize',
  '原価': 'costPrice',
  '売価': 'sellingPrice',
  '在庫金額': 'stockValue',
  '表示価格': 'displayPrice',
  'ＪＡＮコード': 'janCode',
  'JANコード': 'janCode',
  // Additional mappings for the sample CSV
  'SKU': 'productCode',
  'b品番': 'productCode',
  'b商品名': 'productName',
  'GTIN': 'janCode',
  '上代税込': 'sellingPrice',
  '原価税込': 'costPrice',
}

function getColumnIndices(headers: string[], savedMapping: any): Record<string, number> {
  const columnIndices: Record<string, number> = {}

  if (savedMapping?.isConfigured) {
    const mappings = savedMapping.columnMappings as Record<string, number | null>
    for (const [fieldName, colIndex] of Object.entries(mappings)) {
      if (colIndex !== null && colIndex >= 0 && colIndex < headers.length) {
        columnIndices[fieldName] = colIndex
      }
    }
  } else {
    headers.forEach((header, index) => {
      const fieldName = DEFAULT_COLUMN_MAP[header.trim()]
      if (fieldName && !(fieldName in columnIndices)) {
        columnIndices[fieldName] = index
      }
    })
  }

  return columnIndices
}

function parseRow(row: string[], columnIndices: Record<string, number>, clientId: number, importLogId: number) {
  const getValue = (field: string): string => {
    const idx = columnIndices[field]
    return idx !== undefined ? (row[idx] || '').trim() : ''
  }

  const getIntValue = (field: string): number => {
    const val = getValue(field)
    const num = parseInt(val, 10)
    return isNaN(num) ? 0 : num
  }

  const getDecimalValue = (field: string): number => {
    const val = getValue(field)
    const num = parseFloat(val)
    return isNaN(num) ? 0 : num
  }

  return {
    clientId,
    productCode: getValue('productCode'),
    productName: getValue('productName') || getValue('productCode'),
    janCode: getValue('janCode') || null,
    supplierCode: getValue('supplierCode') || null,
    supplierName: getValue('supplierName') || null,
    stockQuantity: getIntValue('stockQuantity'),
    allocatedQuantity: getIntValue('allocatedQuantity'),
    freeStockQuantity: getIntValue('freeStockQuantity'),
    defectiveStockQuantity: getIntValue('defectiveStockQuantity'),
    shortageQuantity: getIntValue('shortageQuantity'),
    orderRemainingQuantity: getIntValue('orderRemainingQuantity'),
    optimalStockQuantity: getIntValue('optimalStockQuantity'),
    orderPoint: getIntValue('orderPoint'),
    lotSize: getIntValue('lotSize'),
    costPrice: getDecimalValue('costPrice'),
    sellingPrice: getDecimalValue('sellingPrice'),
    stockValue: getDecimalValue('stockValue'),
    displayPrice: getValue('displayPrice') || null,
    productCategory: getValue('productCategory') || null,
    productTag: getValue('productTag') || null,
    handlingCategory: getValue('handlingCategory') || null,
    importLogId,
  }
}
