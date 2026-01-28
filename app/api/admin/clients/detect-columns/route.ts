import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import * as iconv from 'iconv-lite'

// Maximum number of columns to support
const MAX_COLUMNS = 100
// Only read first 64KB for header detection (enough for most CSVs)
const MAX_BYTES_TO_READ = 64 * 1024

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'ファイルが選択されていません' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { success: false, error: 'CSVファイルを選択してください' },
        { status: 400 }
      )
    }

    // Only read first portion of file for header detection
    const bytesToRead = Math.min(file.size, MAX_BYTES_TO_READ)
    const slicedFile = file.slice(0, bytesToRead)
    const arrayBuffer = await slicedFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Detect encoding and convert to UTF-8
    let content: string
    const encoding = detectEncoding(buffer)
    try {
      content = iconv.decode(buffer, encoding)
    } catch {
      // Fallback to UTF-8
      content = buffer.toString('utf-8')
    }

    // Remove BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.substring(1)
    }

    // Normalize line endings (handle CR, LF, CRLF)
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // Split into lines and get the first complete line
    const lines = content.split('\n')

    if (lines.length === 0 || !lines[0].trim()) {
      return NextResponse.json(
        { success: false, error: 'ファイルが空です' },
        { status: 400 }
      )
    }

    // Parse the first line (header)
    const headerLine = lines[0]
    const headers = parseCSVLine(headerLine)

    if (headers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ヘッダー行が空です' },
        { status: 400 }
      )
    }

    // Limit to MAX_COLUMNS
    const limitedHeaders = headers.slice(0, MAX_COLUMNS)

    if (headers.length > MAX_COLUMNS) {
      console.log(`CSV has ${headers.length} columns, limiting to ${MAX_COLUMNS}`)
    }

    return NextResponse.json({
      success: true,
      headers: limitedHeaders,
      totalColumns: limitedHeaders.length,
      originalColumns: headers.length,
      truncated: headers.length > MAX_COLUMNS,
      fileName: file.name,
      fileSize: file.size,
      detectedEncoding: encoding,
    })
  } catch (error) {
    console.error('Detect columns error:', error)
    return NextResponse.json(
      { success: false, error: 'カラム検出中にエラーが発生しました' },
      { status: 500 }
    )
  }
}

/**
 * Detect encoding from buffer - improved detection for UTF-8 vs Shift_JIS
 */
function detectEncoding(buffer: Buffer): string {
  // Check for BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8'
  }

  // Try to validate as UTF-8 first (more reliable approach)
  let isValidUtf8 = true
  let i = 0
  const checkLength = Math.min(buffer.length, 4096) // Check first 4KB

  while (i < checkLength && isValidUtf8) {
    const byte = buffer[i]

    if (byte < 0x80) {
      // ASCII - valid in both encodings
      i++
    } else if ((byte & 0xE0) === 0xC0) {
      // 2-byte UTF-8 sequence (110xxxxx 10xxxxxx)
      if (i + 1 >= checkLength || (buffer[i + 1] & 0xC0) !== 0x80) {
        isValidUtf8 = false
      } else {
        i += 2
      }
    } else if ((byte & 0xF0) === 0xE0) {
      // 3-byte UTF-8 sequence (1110xxxx 10xxxxxx 10xxxxxx) - Japanese characters
      if (i + 2 >= checkLength ||
          (buffer[i + 1] & 0xC0) !== 0x80 ||
          (buffer[i + 2] & 0xC0) !== 0x80) {
        isValidUtf8 = false
      } else {
        i += 3
      }
    } else if ((byte & 0xF8) === 0xF0) {
      // 4-byte UTF-8 sequence
      if (i + 3 >= checkLength ||
          (buffer[i + 1] & 0xC0) !== 0x80 ||
          (buffer[i + 2] & 0xC0) !== 0x80 ||
          (buffer[i + 3] & 0xC0) !== 0x80) {
        isValidUtf8 = false
      } else {
        i += 4
      }
    } else if (byte >= 0x80) {
      // Invalid UTF-8 start byte - likely Shift_JIS
      isValidUtf8 = false
    }
  }

  if (isValidUtf8) {
    return 'utf-8'
  }

  // If not valid UTF-8, check for Shift_JIS patterns
  return 'Shift_JIS'
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  result.push(current.trim())

  return result
}
