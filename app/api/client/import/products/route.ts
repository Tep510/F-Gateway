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

const BATCH_SIZE = 500

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

interface ProductData {
  clientId: number
  productCode: string
  productName: string
  janCode: string | null
  supplierCode: string | null
  supplierName: string | null
  stockQuantity: number
  allocatedQuantity: number
  freeStockQuantity: number
  defectiveStockQuantity: number
  shortageQuantity: number
  orderRemainingQuantity: number
  optimalStockQuantity: number
  orderPoint: number
  lotSize: number
  costPrice: number
  sellingPrice: number
  stockValue: number
  displayPrice: string | null
  productCategory: string | null
  productTag: string | null
  handlingCategory: string | null
  importLogId: number
}

async function batchUpsertProducts(products: ProductData[]): Promise<{ inserted: number; updated: number }> {
  if (products.length === 0) return { inserted: 0, updated: 0 }

  // Get existing product codes to count inserts vs updates
  const productCodes = products.map(p => p.productCode)
  const clientId = products[0].clientId

  const existingProducts = await prisma.productMaster.findMany({
    where: {
      clientId,
      productCode: { in: productCodes }
    },
    select: { productCode: true }
  })
  const existingCodes = new Set(existingProducts.map(p => p.productCode))

  let inserted = 0
  let updated = 0

  // Build batch upsert using Prisma transaction with createMany fallback
  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      if (existingCodes.has(product.productCode)) {
        await tx.productMaster.update({
          where: {
            clientId_productCode: {
              clientId: product.clientId,
              productCode: product.productCode,
            }
          },
          data: {
            productName: product.productName,
            janCode: product.janCode,
            supplierCode: product.supplierCode,
            supplierName: product.supplierName,
            stockQuantity: product.stockQuantity,
            allocatedQuantity: product.allocatedQuantity,
            freeStockQuantity: product.freeStockQuantity,
            defectiveStockQuantity: product.defectiveStockQuantity,
            shortageQuantity: product.shortageQuantity,
            orderRemainingQuantity: product.orderRemainingQuantity,
            optimalStockQuantity: product.optimalStockQuantity,
            orderPoint: product.orderPoint,
            lotSize: product.lotSize,
            costPrice: product.costPrice,
            sellingPrice: product.sellingPrice,
            stockValue: product.stockValue,
            displayPrice: product.displayPrice,
            productCategory: product.productCategory,
            productTag: product.productTag,
            handlingCategory: product.handlingCategory,
            importLogId: product.importLogId,
          }
        })
        updated++
      } else {
        await tx.productMaster.create({
          data: product
        })
        inserted++
      }
    }
  }, {
    timeout: 60000, // 60 second timeout for large batches
  })

  return { inserted, updated }
}

// Alternative: Raw SQL batch upsert for maximum performance
async function batchUpsertProductsRaw(products: ProductData[]): Promise<{ inserted: number; updated: number }> {
  if (products.length === 0) return { inserted: 0, updated: 0 }

  const clientId = products[0].clientId

  // Get existing count before upsert
  const existingCount = await prisma.productMaster.count({
    where: {
      clientId,
      productCode: { in: products.map(p => p.productCode) }
    }
  })

  // Build VALUES clause for raw SQL
  const values = products.map(p => {
    const escape = (val: string | null) => val === null ? 'NULL' : `'${val.replace(/'/g, "''")}'`
    return `(
      ${p.clientId},
      ${escape(p.productCode)},
      ${escape(p.productName)},
      ${escape(p.janCode)},
      ${escape(p.supplierCode)},
      ${escape(p.supplierName)},
      ${p.stockQuantity},
      ${p.allocatedQuantity},
      ${p.freeStockQuantity},
      ${p.defectiveStockQuantity},
      ${p.shortageQuantity},
      ${p.orderRemainingQuantity},
      ${p.optimalStockQuantity},
      ${p.orderPoint},
      ${p.lotSize},
      ${p.costPrice},
      ${p.sellingPrice},
      ${p.stockValue},
      ${escape(p.displayPrice)},
      ${escape(p.productCategory)},
      ${escape(p.productTag)},
      ${escape(p.handlingCategory)},
      ${p.importLogId},
      true,
      NOW(),
      NOW()
    )`
  }).join(',\n')

  const sql = `
    INSERT INTO product_masters (
      client_id, product_code, product_name, jan_code,
      supplier_code, supplier_name,
      stock_quantity, allocated_quantity, free_stock_quantity,
      defective_stock_quantity, shortage_quantity, order_remaining_quantity,
      optimal_stock_quantity, order_point, lot_size,
      cost_price, selling_price, stock_value,
      display_price, product_category, product_tag, handling_category,
      import_log_id, is_active, imported_at, updated_at
    ) VALUES ${values}
    ON CONFLICT (client_id, product_code)
    DO UPDATE SET
      product_name = EXCLUDED.product_name,
      jan_code = EXCLUDED.jan_code,
      supplier_code = EXCLUDED.supplier_code,
      supplier_name = EXCLUDED.supplier_name,
      stock_quantity = EXCLUDED.stock_quantity,
      allocated_quantity = EXCLUDED.allocated_quantity,
      free_stock_quantity = EXCLUDED.free_stock_quantity,
      defective_stock_quantity = EXCLUDED.defective_stock_quantity,
      shortage_quantity = EXCLUDED.shortage_quantity,
      order_remaining_quantity = EXCLUDED.order_remaining_quantity,
      optimal_stock_quantity = EXCLUDED.optimal_stock_quantity,
      order_point = EXCLUDED.order_point,
      lot_size = EXCLUDED.lot_size,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      stock_value = EXCLUDED.stock_value,
      display_price = EXCLUDED.display_price,
      product_category = EXCLUDED.product_category,
      product_tag = EXCLUDED.product_tag,
      handling_category = EXCLUDED.handling_category,
      import_log_id = EXCLUDED.import_log_id,
      updated_at = NOW()
  `

  await prisma.$executeRawUnsafe(sql)

  const updated = existingCount
  const inserted = products.length - existingCount

  return { inserted, updated }
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

    // Parse all data rows first (in-memory)
    const dataRows = rows.slice(1)
    const products: ProductData[] = []
    const errors: { row: number; error: string }[] = []
    let errorRows = 0

    const getValue = (row: string[], field: string): string => {
      const idx = columnIndices[field]
      return idx !== undefined ? (row[idx] || '').trim() : ''
    }

    const getIntValue = (row: string[], field: string): number => {
      const val = getValue(row, field)
      const num = parseInt(val, 10)
      return isNaN(num) ? 0 : num
    }

    const getDecimalValue = (row: string[], field: string): number => {
      const val = getValue(row, field)
      const num = parseFloat(val)
      return isNaN(num) ? 0 : num
    }

    // Parse all rows
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      try {
        const productCode = getValue(row, 'productCode')
        if (!productCode) {
          errors.push({ row: i + 2, error: '商品コードが空です' })
          errorRows++
          continue
        }

        products.push({
          clientId,
          productCode,
          productName: getValue(row, 'productName') || productCode,
          janCode: getValue(row, 'janCode') || null,
          supplierCode: getValue(row, 'supplierCode') || null,
          supplierName: getValue(row, 'supplierName') || null,
          stockQuantity: getIntValue(row, 'stockQuantity'),
          allocatedQuantity: getIntValue(row, 'allocatedQuantity'),
          freeStockQuantity: getIntValue(row, 'freeStockQuantity'),
          defectiveStockQuantity: getIntValue(row, 'defectiveStockQuantity'),
          shortageQuantity: getIntValue(row, 'shortageQuantity'),
          orderRemainingQuantity: getIntValue(row, 'orderRemainingQuantity'),
          optimalStockQuantity: getIntValue(row, 'optimalStockQuantity'),
          orderPoint: getIntValue(row, 'orderPoint'),
          lotSize: getIntValue(row, 'lotSize'),
          costPrice: getDecimalValue(row, 'costPrice'),
          sellingPrice: getDecimalValue(row, 'sellingPrice'),
          stockValue: getDecimalValue(row, 'stockValue'),
          displayPrice: getValue(row, 'displayPrice') || null,
          productCategory: getValue(row, 'productCategory') || null,
          productTag: getValue(row, 'productTag') || null,
          handlingCategory: getValue(row, 'handlingCategory') || null,
          importLogId: importLog.id,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ row: i + 2, error: message })
        errorRows++
      }
    }

    // Process in batches using raw SQL for maximum performance
    let totalInserted = 0
    let totalUpdated = 0

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      try {
        const { inserted, updated } = await batchUpsertProductsRaw(batch)
        totalInserted += inserted
        totalUpdated += updated
      } catch (err) {
        // If raw SQL fails, fall back to transaction-based approach
        console.error('Raw SQL batch failed, falling back to transaction:', err)
        try {
          const { inserted, updated } = await batchUpsertProducts(batch)
          totalInserted += inserted
          totalUpdated += updated
        } catch (fallbackErr) {
          const message = fallbackErr instanceof Error ? fallbackErr.message : 'Batch error'
          errors.push({ row: i + 2, error: `Batch error: ${message}` })
          errorRows += batch.length
        }
      }
    }

    // Update import log
    await prisma.productImportLog.update({
      where: { id: importLog.id },
      data: {
        importStatus: errorRows > 0 && totalInserted + totalUpdated === 0 ? 'failed' : 'completed',
        insertedRows: totalInserted,
        updatedRows: totalUpdated,
        errorRows,
        errorDetails: errors.length > 0 ? errors.slice(0, 100) : undefined,
        completedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      importLogId: importLog.id,
      totalRows: dataRows.length,
      insertedRows: totalInserted,
      updatedRows: totalUpdated,
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
