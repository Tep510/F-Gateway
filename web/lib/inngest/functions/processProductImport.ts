import { inngest } from '../client'
import { prisma } from '@/lib/prisma'
import iconv from 'iconv-lite'
import { log } from '@/lib/systemLog'

// Batch size for database operations
const BATCH_SIZE = 500
// Progress update interval (every N rows)
const PROGRESS_UPDATE_INTERVAL = 1000

/**
 * Inngest function to process product CSV imports in the background
 * This allows processing of large files (35MB+) without timeout issues
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
      const log = await prisma.productImportLog.findUnique({
        where: { id: importLogId },
        include: {
          client: true,
        },
      })

      if (!log) {
        throw new Error(`Import log not found: ${importLogId}`)
      }

      if (!log.blobUrl) {
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

      return log
    })

    // Step 2: Fetch and parse CSV from Vercel Blob
    const parsedData = await step.run('fetch-and-parse-csv', async () => {
      const response = await fetch(importLog.blobUrl!)

      if (!response.ok) {
        throw new Error(`Failed to fetch CSV from blob: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Detect encoding
      const encoding = detectEncoding(buffer)

      // Update file size if not set
      if (!importLog.fileSize || importLog.fileSize === BigInt(0)) {
        await prisma.productImportLog.update({
          where: { id: importLogId },
          data: { fileSize: BigInt(buffer.length), encoding },
        })
      }

      // Decode content
      const content = iconv.decode(buffer, encoding)

      // Parse CSV
      const rows = parseCSV(content)

      if (rows.length < 2) {
        throw new Error('CSV file is empty or has no data rows')
      }

      // Update total rows
      await prisma.productImportLog.update({
        where: { id: importLogId },
        data: { totalRows: rows.length - 1 },
      })

      return { rows, encoding }
    })

    // Step 3: Get column mapping
    const columnIndices = await step.run('get-column-mapping', async () => {
      const headers = parsedData.rows[0]

      // Check for saved column mapping
      const savedMapping = await prisma.clientProductColumnMapping.findUnique({
        where: { clientId: importLog.clientId },
      })

      const indices: Record<string, number> = {}

      if (savedMapping?.isConfigured) {
        // Use saved column mappings
        const mappings = savedMapping.columnMappings as Record<string, number | null>
        for (const [fieldName, colIndex] of Object.entries(mappings)) {
          if (colIndex !== null && colIndex >= 0 && colIndex < headers.length) {
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

        headers.forEach((header, index) => {
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

    // Step 4: Process data rows in batches
    const result = await step.run('process-rows', async () => {
      const dataRows = parsedData.rows.slice(1)
      let insertedRows = 0
      let updatedRows = 0
      let errorRows = 0
      const errors: { row: number; error: string }[] = []
      let lastProcessedRow = 0

      // Process in batches
      for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, dataRows.length)
        const batch = dataRows.slice(batchStart, batchEnd)

        for (let i = 0; i < batch.length; i++) {
          const rowIndex = batchStart + i
          const row = batch[i]

          try {
            const result = await processRow(
              row,
              columnIndices,
              importLog.clientId,
              importLogId
            )

            if (result.inserted) insertedRows++
            else updatedRows++
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            if (errors.length < 100) {
              errors.push({ row: rowIndex + 2, error: message })
            }
            errorRows++
          }

          lastProcessedRow = rowIndex + 1
        }

        // Update progress periodically
        if (lastProcessedRow % PROGRESS_UPDATE_INTERVAL === 0 || batchEnd === dataRows.length) {
          await prisma.productImportLog.update({
            where: { id: importLogId },
            data: {
              lastProcessedRow,
              insertedRows,
              updatedRows,
              errorRows,
            },
          })
        }
      }

      return { insertedRows, updatedRows, errorRows, errors, totalRows: dataRows.length }
    })

    // Step 5: Finalize import
    await step.run('finalize-import', async () => {
      const finalStatus = result.errorRows > 0 && result.insertedRows + result.updatedRows === 0
        ? 'failed'
        : 'completed'

      await prisma.productImportLog.update({
        where: { id: importLogId },
        data: {
          importStatus: finalStatus,
          insertedRows: result.insertedRows,
          updatedRows: result.updatedRows,
          errorRows: result.errorRows,
          lastProcessedRow: result.totalRows,
          errorDetails: result.errors.length > 0 ? result.errors : undefined,
          completedAt: new Date(),
        },
      })

      await log.info('product_import', 'background_import_complete',
        `バックグラウンドインポート完了: ${importLog.fileName}`, {
        clientId: importLog.clientId,
        metadata: {
          importLogId,
          totalRows: result.totalRows,
          insertedRows: result.insertedRows,
          updatedRows: result.updatedRows,
          errorRows: result.errorRows,
          status: finalStatus,
        },
      })
    })

    return {
      success: true,
      importLogId,
      totalRows: result.totalRows,
      insertedRows: result.insertedRows,
      updatedRows: result.updatedRows,
      errorRows: result.errorRows,
    }
  }
)

/**
 * Process a single row
 */
async function processRow(
  row: string[],
  columnIndices: Record<string, number>,
  clientId: number,
  importLogId: number
): Promise<{ inserted: boolean }> {
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
    throw new Error('商品コードが空です')
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
    importLogId,
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
    return { inserted: false }
  } else {
    await prisma.productMaster.create({
      data: productData,
    })
    return { inserted: true }
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
