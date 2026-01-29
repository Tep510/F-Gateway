import { inngest } from '../client'
import { prisma } from '@/lib/prisma'
import iconv from 'iconv-lite'
import { log } from '@/lib/systemLog'
import { Prisma } from '@/app/generated/prisma'

// Rows per step (to stay within Vercel timeout)
// Reduced to 1000 for faster processing per step
const ROWS_PER_STEP = 1000
// Batch size for database operations within a step
const DB_BATCH_SIZE = 200

/**
 * Inngest function to process product CSV imports in the background
 * This allows processing of large files (35MB+) without timeout issues
 * Processing is split into multiple steps to avoid Vercel timeout
 */
export const processProductImport = inngest.createFunction(
  {
    id: 'process-product-import',
    name: 'Process Product CSV Import',
    retries: 2,
  },
  { event: 'product/import.requested' },
  async ({ event, step }) => {
    const { importLogId } = event.data

    // Step 1: Fetch import log and validate
    const importLog = await step.run('fetch-import-log', async () => {
      const logEntry = await prisma.productImportLog.findUnique({
        where: { id: importLogId },
        include: {
          client: true,
        },
      })

      if (!logEntry) {
        throw new Error(`Import log not found: ${importLogId}`)
      }

      if (!logEntry.blobUrl) {
        throw new Error(`No blob URL for import log: ${importLogId}`)
      }

      // Update status to processing
      await prisma.productImportLog.update({
        where: { id: importLogId },
        data: {
          importStatus: 'processing',
          processingStartedAt: new Date(),
        },
      })

      // Return only essential data, not the full object
      return {
        id: logEntry.id,
        clientId: logEntry.clientId,
        blobUrl: logEntry.blobUrl,
        fileName: logEntry.fileName,
      }
    })

    // Step 2: Fetch CSV and get metadata (don't return full content)
    const csvMetadata = await step.run('fetch-csv-metadata', async () => {
      const response = await fetch(importLog.blobUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch CSV from blob: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Detect encoding
      const encoding = detectEncoding(buffer)

      // Update file size
      await prisma.productImportLog.update({
        where: { id: importLogId },
        data: { fileSize: BigInt(buffer.length), encoding },
      })

      // Decode and count rows
      const content = iconv.decode(buffer, encoding)
      const rows = parseCSV(content)

      if (rows.length < 2) {
        throw new Error('CSV file is empty or has no data rows')
      }

      const totalRows = rows.length - 1

      // Update total rows
      await prisma.productImportLog.update({
        where: { id: importLogId },
        data: { totalRows },
      })

      // Store headers for column mapping
      const headers = rows[0]

      return {
        encoding,
        totalRows,
        headers,
        fileSize: buffer.length,
      }
    })

    // Step 3: Get column mapping (small data)
    const columnIndices = await step.run('get-column-mapping', async () => {
      // Check for saved column mapping
      const savedMapping = await prisma.clientProductColumnMapping.findUnique({
        where: { clientId: importLog.clientId },
      })

      const indices: Record<string, number> = {}

      if (savedMapping?.isConfigured) {
        // Use saved column mappings
        const mappings = savedMapping.columnMappings as Record<string, number | null>
        for (const [fieldName, colIndex] of Object.entries(mappings)) {
          if (colIndex !== null && colIndex >= 0 && colIndex < csvMetadata.headers.length) {
            indices[fieldName] = colIndex
          }
        }
      } else {
        // Fallback to header name based mapping
        const DEFAULT_COLUMN_MAP: Record<string, string> = {
          '商品コード': 'productCode',
          '商品名': 'productName',
          '仕入先コード': 'supplierCode',
          '仕入先名': 'supplierName',
          '在庫数': 'stockQuantity',
          '原価': 'costPrice',
          '売価': 'sellingPrice',
          'ＪＡＮコード': 'janCode',
          'JANコード': 'janCode',
        }

        csvMetadata.headers.forEach((header, index) => {
          const fieldName = DEFAULT_COLUMN_MAP[header.trim()]
          if (fieldName) {
            indices[fieldName] = index
          }
        })
      }

      if (!('productCode' in indices)) {
        throw new Error('商品コードのカラムマッピングが見つかりません')
      }

      return indices
    })

    // Calculate number of chunks needed
    const numChunks = Math.ceil(csvMetadata.totalRows / ROWS_PER_STEP)

    // Process each chunk in a separate step
    let totalInserted = 0
    let totalUpdated = 0
    let totalErrors = 0

    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      const startRow = chunkIndex * ROWS_PER_STEP
      const endRow = Math.min(startRow + ROWS_PER_STEP, csvMetadata.totalRows)

      // Each chunk is a separate step - this allows Inngest to checkpoint progress
      const chunkResult = await step.run(`process-chunk-${chunkIndex}`, async () => {
        // Fetch CSV for this chunk
        const response = await fetch(importLog.blobUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch CSV from blob: ${response.status}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const content = iconv.decode(buffer, csvMetadata.encoding)
        const allRows = parseCSV(content)

        // Get only the rows for this chunk (skip header, +1 offset)
        const chunkRows = allRows.slice(startRow + 1, endRow + 1)

        let inserted = 0
        let updated = 0
        let errors = 0

        // Process in smaller DB batches
        for (let batchStart = 0; batchStart < chunkRows.length; batchStart += DB_BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + DB_BATCH_SIZE, chunkRows.length)
          const batch = chunkRows.slice(batchStart, batchEnd)

          const batchResult = await processBatch(
            batch,
            startRow + batchStart,
            columnIndices,
            importLog.clientId,
            importLogId
          )

          inserted += batchResult.inserted
          updated += batchResult.updated
          errors += batchResult.errors.length
        }

        // Update progress after this chunk
        await prisma.productImportLog.update({
          where: { id: importLogId },
          data: {
            lastProcessedRow: endRow,
            insertedRows: { increment: inserted },
            updatedRows: { increment: updated },
            errorRows: { increment: errors },
          },
        })

        return { inserted, updated, errors }
      })

      totalInserted += chunkResult.inserted
      totalUpdated += chunkResult.updated
      totalErrors += chunkResult.errors
    }

    // Final step: Finalize import
    await step.run('finalize-import', async () => {
      const finalStatus = totalErrors > 0 && totalInserted + totalUpdated === 0
        ? 'failed'
        : 'completed'

      await prisma.productImportLog.update({
        where: { id: importLogId },
        data: {
          importStatus: finalStatus,
          completedAt: new Date(),
        },
      })

      await log.info('product_import', 'background_import_complete',
        `バックグラウンドインポート完了: ${importLog.fileName}`, {
        clientId: importLog.clientId,
        metadata: {
          importLogId,
          totalRows: csvMetadata.totalRows,
          insertedRows: totalInserted,
          updatedRows: totalUpdated,
          errorRows: totalErrors,
          status: finalStatus,
        },
      })
    })

    return {
      success: true,
      importLogId,
      totalRows: csvMetadata.totalRows,
      insertedRows: totalInserted,
      updatedRows: totalUpdated,
      errorRows: totalErrors,
    }
  }
)

/**
 * Process a batch of rows using PostgreSQL bulk upsert for maximum performance
 */
async function processBatch(
  rows: string[][],
  startIndex: number,
  columnIndices: Record<string, number>,
  clientId: number,
  importLogId: number
): Promise<{ inserted: number; updated: number; errors: { row: number; error: string }[] }> {
  const errors: { row: number; error: string }[] = []

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

  // Prepare valid rows for bulk insert
  const validRows: Array<{
    rowNum: number
    data: {
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
  }> = []

  // Parse all rows and collect valid ones
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = startIndex + i + 2

    const productCode = getValue(row, 'productCode')
    if (!productCode) {
      errors.push({ row: rowNum, error: '商品コードが空です' })
      continue
    }

    validRows.push({
      rowNum,
      data: {
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
        importLogId,
      },
    })
  }

  if (validRows.length === 0) {
    return { inserted: 0, updated: 0, errors }
  }

  // Get existing product codes to determine insert vs update count
  const productCodes = validRows.map(r => r.data.productCode)
  const existingProducts = await prisma.productMaster.findMany({
    where: {
      clientId,
      productCode: { in: productCodes },
    },
    select: { productCode: true },
  })
  const existingCodes = new Set(existingProducts.map(p => p.productCode))

  // Count inserts vs updates
  let insertCount = 0
  let updateCount = 0
  for (const row of validRows) {
    if (existingCodes.has(row.data.productCode)) {
      updateCount++
    } else {
      insertCount++
    }
  }

  // Use PostgreSQL bulk upsert via raw SQL for maximum performance
  try {
    // Build values for bulk insert
    const values = validRows.map((row, idx) => {
      const d = row.data
      return Prisma.sql`(
        ${d.clientId}, ${d.productCode}, ${d.productName}, ${d.janCode},
        ${d.supplierCode}, ${d.supplierName}, ${d.stockQuantity}, ${d.allocatedQuantity},
        ${d.freeStockQuantity}, ${d.defectiveStockQuantity}, ${d.shortageQuantity},
        ${d.orderRemainingQuantity}, ${d.optimalStockQuantity}, ${d.orderPoint},
        ${d.lotSize}, ${d.costPrice}::decimal, ${d.sellingPrice}::decimal, ${d.stockValue}::decimal,
        ${d.displayPrice}, ${d.productCategory}, ${d.productTag}, ${d.handlingCategory},
        ${d.importLogId}, NOW(), NOW()
      )`
    })

    // Join values with commas
    const valuesList = Prisma.join(values, ',')

    // Execute bulk upsert
    await prisma.$executeRaw`
      INSERT INTO "ProductMaster" (
        "client_id", "product_code", "product_name", "jan_code",
        "supplier_code", "supplier_name", "stock_quantity", "allocated_quantity",
        "free_stock_quantity", "defective_stock_quantity", "shortage_quantity",
        "order_remaining_quantity", "optimal_stock_quantity", "order_point",
        "lot_size", "cost_price", "selling_price", "stock_value",
        "display_price", "product_category", "product_tag", "handling_category",
        "import_log_id", "created_at", "updated_at"
      )
      VALUES ${valuesList}
      ON CONFLICT ("client_id", "product_code") DO UPDATE SET
        "product_name" = EXCLUDED."product_name",
        "jan_code" = EXCLUDED."jan_code",
        "supplier_code" = EXCLUDED."supplier_code",
        "supplier_name" = EXCLUDED."supplier_name",
        "stock_quantity" = EXCLUDED."stock_quantity",
        "allocated_quantity" = EXCLUDED."allocated_quantity",
        "free_stock_quantity" = EXCLUDED."free_stock_quantity",
        "defective_stock_quantity" = EXCLUDED."defective_stock_quantity",
        "shortage_quantity" = EXCLUDED."shortage_quantity",
        "order_remaining_quantity" = EXCLUDED."order_remaining_quantity",
        "optimal_stock_quantity" = EXCLUDED."optimal_stock_quantity",
        "order_point" = EXCLUDED."order_point",
        "lot_size" = EXCLUDED."lot_size",
        "cost_price" = EXCLUDED."cost_price",
        "selling_price" = EXCLUDED."selling_price",
        "stock_value" = EXCLUDED."stock_value",
        "display_price" = EXCLUDED."display_price",
        "product_category" = EXCLUDED."product_category",
        "product_tag" = EXCLUDED."product_tag",
        "handling_category" = EXCLUDED."handling_category",
        "import_log_id" = EXCLUDED."import_log_id",
        "updated_at" = NOW()
    `

    return { inserted: insertCount, updated: updateCount, errors }
  } catch (err) {
    // If bulk insert fails, add generic error
    const message = err instanceof Error ? err.message : 'Unknown error'
    errors.push({ row: startIndex + 2, error: `バルク挿入エラー: ${message}` })
    return { inserted: 0, updated: 0, errors }
  }
}

/**
 * Detect encoding from buffer
 */
function detectEncoding(buffer: Buffer): string {
  // Check for BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8'
  }

  // Validate UTF-8 byte sequences
  let isValidUtf8 = true
  let i = 0
  const checkLength = Math.min(buffer.length, 4096)

  while (i < checkLength && isValidUtf8) {
    const byte = buffer[i]

    if (byte < 0x80) {
      i++
    } else if ((byte & 0xE0) === 0xC0) {
      if (i + 1 >= checkLength || (buffer[i + 1] & 0xC0) !== 0x80) {
        isValidUtf8 = false
      } else {
        i += 2
      }
    } else if ((byte & 0xF0) === 0xE0) {
      if (i + 2 >= checkLength ||
          (buffer[i + 1] & 0xC0) !== 0x80 ||
          (buffer[i + 2] & 0xC0) !== 0x80) {
        isValidUtf8 = false
      } else {
        i += 3
      }
    } else if ((byte & 0xF8) === 0xF0) {
      if (i + 3 >= checkLength ||
          (buffer[i + 1] & 0xC0) !== 0x80 ||
          (buffer[i + 2] & 0xC0) !== 0x80 ||
          (buffer[i + 3] & 0xC0) !== 0x80) {
        isValidUtf8 = false
      } else {
        i += 4
      }
    } else if (byte >= 0x80) {
      isValidUtf8 = false
    }
  }

  return isValidUtf8 ? 'utf-8' : 'Shift_JIS'
}

/**
 * Parse CSV content
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

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
