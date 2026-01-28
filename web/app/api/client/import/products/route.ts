import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import iconv from 'iconv-lite'

// CSV column mapping (Japanese header -> field name)
const COLUMN_MAP: Record<string, string> = {
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
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField)
        if (currentRow.some(f => f.trim())) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
        if (char === '\r') i++
      } else if (char !== '\r') {
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
    const client = user.client

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが必要です' },
        { status: 400 }
      )
    }

    // Read and decode file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const encoding = detectEncoding(buffer)
    const content = iconv.decode(buffer, encoding)

    // Parse CSV
    const rows = parseCSV(content)
    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'CSVファイルが空またはデータ行がありません' },
        { status: 400 }
      )
    }

    // Map headers
    const headers = rows[0]
    const columnIndices: Record<string, number> = {}

    headers.forEach((header, index) => {
      const fieldName = COLUMN_MAP[header.trim()]
      if (fieldName) {
        columnIndices[fieldName] = index
      }
    })

    if (!('productCode' in columnIndices)) {
      return NextResponse.json(
        { error: '商品コード列がCSVに見つかりません' },
        { status: 400 }
      )
    }

    // Create import log
    const importLog = await prisma.productImportLog.create({
      data: {
        clientId,
        fileName: file.name,
        fileSize: BigInt(file.size),
        encoding,
        importStatus: 'processing',
        totalRows: rows.length - 1,
        importedBy: session.user.id,
      },
    })

    // Process data rows
    const dataRows = rows.slice(1)
    let insertedRows = 0
    let updatedRows = 0
    let errorRows = 0
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      try {
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

        const productCode = getValue('productCode')
        if (!productCode) {
          errors.push({ row: i + 2, error: '商品コードが空です' })
          errorRows++
          continue
        }

        const productData = {
          clientId,
          productCode,
          productName: getValue('productName') || productCode,
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
          importLogId: importLog.id,
        }

        const existing = await prisma.productMaster.findUnique({
          where: {
            clientId_productCode: {
              clientId,
              productCode,
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
        errors.push({ row: i + 2, error: message })
        errorRows++
      }
    }

    // Update import log
    await prisma.productImportLog.update({
      where: { id: importLog.id },
      data: {
        importStatus: errorRows > 0 && insertedRows + updatedRows === 0 ? 'failed' : 'completed',
        insertedRows,
        updatedRows,
        errorRows,
        errorDetails: errors.length > 0 ? errors.slice(0, 100) : undefined,
        completedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      importLogId: importLog.id,
      totalRows: dataRows.length,
      insertedRows,
      updatedRows,
      errorRows,
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error('Client product import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
