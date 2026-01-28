"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"
import { upload } from "@vercel/blob/client"

interface Client {
  id: number
  clientCode: string
  clientName: string
}

interface ColumnMapping {
  sampleHeaders: string[]
  columnMappings: Record<string, number | null>
  totalColumns: number
  isConfigured: boolean
  sampleFileName?: string
}

interface ImportResult {
  success: boolean
  importLogId?: number
  totalRows?: number
  insertedRows?: number
  updatedRows?: number
  errorRows?: number
  errors?: { row: number; error: string }[]
  error?: string
}

interface ImportProgress {
  id: number
  status: string
  fileName: string
  totalRows: number | null
  lastProcessedRow: number
  insertedRows: number | null
  updatedRows: number | null
  errorRows: number | null
  progress: number
  startedAt: string
  processingStartedAt: string | null
  completedAt: string | null
  errorDetails: any
}

// システムフィールド定義
const SYSTEM_FIELDS = [
  { key: "productCode", label: "商品コード (SKU)", required: true, description: "商品を一意に識別するコード" },
  { key: "janCode", label: "JANコード", required: true, description: "JANコード/バーコード" },
  { key: "productName", label: "商品名", required: false, description: "商品の名称" },
  { key: "supplierCode", label: "仕入先コード", required: false, description: "仕入先を識別するコード" },
  { key: "supplierName", label: "仕入先名", required: false, description: "仕入先の名称" },
  { key: "costPrice", label: "原価", required: false, description: "仕入原価" },
  { key: "sellingPrice", label: "売価", required: false, description: "販売価格" },
  { key: "stockQuantity", label: "在庫数", required: false, description: "現在の在庫数量" },
  { key: "productCategory", label: "カテゴリ", required: false, description: "商品カテゴリ" },
  { key: "handlingCategory", label: "取扱区分", required: false, description: "取扱区分コード" },
]

// Large file threshold (4MB - below Vercel's 4.5MB limit)
const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024

// Maximum file size for column detection (100MB)
const MAX_FILE_SIZE_FOR_DETECTION = 100 * 1024 * 1024

/**
 * Read CSV header from file on client side
 * This avoids uploading large files just for column detection
 */
async function readCSVHeaderClientSide(file: File): Promise<{ headers: string[], encoding: string }> {
  return new Promise((resolve, reject) => {
    // Read first 64KB of the file
    const chunkSize = 64 * 1024
    const slice = file.slice(0, chunkSize)
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        const uint8 = new Uint8Array(buffer)

        // Detect encoding and decode
        let encoding = 'utf-8'
        let text: string

        // Check for BOM
        if (uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
          encoding = 'utf-8'
          text = new TextDecoder('utf-8').decode(uint8.slice(3))
        } else {
          // Try UTF-8 first (most common)
          try {
            const decoder = new TextDecoder('utf-8', { fatal: false })
            text = decoder.decode(uint8)

            // Check if decoding produced replacement characters (indicates wrong encoding)
            // For Japanese Shift_JIS files, UTF-8 decode will produce lots of replacement chars
            const replacementCount = (text.match(/\uFFFD/g) || []).length
            if (replacementCount > 10) {
              // Likely not UTF-8, try Shift_JIS
              throw new Error('Too many replacement characters')
            }
            encoding = 'utf-8'
          } catch {
            // Fallback to Shift_JIS
            try {
              encoding = 'shift_jis'
              text = new TextDecoder('shift_jis').decode(uint8)
            } catch {
              // If shift_jis not supported, try with label 'sjis'
              try {
                encoding = 'sjis'
                text = new TextDecoder('sjis').decode(uint8)
              } catch {
                // Last resort: use UTF-8 with replacement
                encoding = 'utf-8'
                text = new TextDecoder('utf-8', { fatal: false }).decode(uint8)
              }
            }
          }
        }

        // Normalize line endings
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

        // Get first line (header)
        const firstLine = text.split('\n')[0]
        if (!firstLine?.trim()) {
          reject(new Error('ファイルが空です'))
          return
        }

        // Parse CSV line
        const headers = parseCSVLine(firstLine)
        if (headers.length === 0) {
          reject(new Error('ヘッダー行が空です'))
          return
        }

        resolve({ headers, encoding })
      } catch (err) {
        console.error('CSV header detection error:', err)
        reject(new Error('ファイルの読み取りに失敗しました。ファイル形式を確認してください。'))
      }
    }

    reader.onerror = () => reject(new Error('ファイル読み取りエラー'))
    reader.readAsArrayBuffer(slice)
  })
}

/**
 * Validate if buffer is valid UTF-8
 */
function validateUtf8(buffer: Uint8Array): boolean {
  const checkLength = Math.min(buffer.length, 4096)
  let i = 0

  while (i < checkLength) {
    const byte = buffer[i]

    if (byte < 0x80) {
      i++
    } else if ((byte & 0xE0) === 0xC0) {
      if (i + 1 >= checkLength || (buffer[i + 1] & 0xC0) !== 0x80) return false
      i += 2
    } else if ((byte & 0xF0) === 0xE0) {
      if (i + 2 >= checkLength ||
          (buffer[i + 1] & 0xC0) !== 0x80 ||
          (buffer[i + 2] & 0xC0) !== 0x80) return false
      i += 3
    } else if ((byte & 0xF8) === 0xF0) {
      if (i + 3 >= checkLength ||
          (buffer[i + 1] & 0xC0) !== 0x80 ||
          (buffer[i + 2] & 0xC0) !== 0x80 ||
          (buffer[i + 3] & 0xC0) !== 0x80) return false
      i += 4
    } else if (byte >= 0x80) {
      return false
    }
  }

  return true
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
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

export default function AdminImport() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<"mapping" | "import">("mapping")

  // Mapping state
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [pendingMappings, setPendingMappings] = useState<Record<string, number | null>>({})
  const [savingMapping, setSavingMapping] = useState(false)
  const [detectingColumns, setDetectingColumns] = useState(false)
  const mappingFileInputRef = useRef<HTMLInputElement>(null)

  // Import state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importLogId, setImportLogId] = useState<number | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isLargeFile, setIsLargeFile] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("この画面には「管理者」ロールが必要です。")
      router.replace("/client")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/admin/clients")
      .then(res => res.json())
      .then(data => {
        setClients(data.clients || [])
        if (data.clients?.length > 0) {
          setSelectedClientId(data.clients[0].id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [status])

  // Load mapping when client changes
  useEffect(() => {
    if (!selectedClientId) return
    loadMapping(selectedClientId)
  }, [selectedClientId])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const loadMapping = async (clientId: number) => {
    setMappingLoading(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/column-mapping`)
      if (res.ok) {
        const data = await res.json()
        setMapping(data.mapping)
        setPendingMappings(data.mapping?.columnMappings || {})
      } else {
        setMapping(null)
        setPendingMappings({})
      }
    } catch {
      setMapping(null)
      setPendingMappings({})
    } finally {
      setMappingLoading(false)
    }
  }

  const pollImportProgress = useCallback(async (logId: number) => {
    try {
      const res = await fetch(`/api/admin/import/products/status/${logId}`)
      if (res.ok) {
        const data: ImportProgress = await res.json()
        setImportProgress(data)

        if (data.status === "completed" || data.status === "failed") {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setUploading(false)
          setResult({
            success: data.status === "completed",
            importLogId: data.id,
            totalRows: data.totalRows || 0,
            insertedRows: data.insertedRows || 0,
            updatedRows: data.updatedRows || 0,
            errorRows: data.errorRows || 0,
            errors: data.errorDetails ? data.errorDetails.slice(0, 10) : [],
          })
        }
      }
    } catch (err) {
      console.error("Polling error:", err)
    }
  }, [])

  const handleSampleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClientId) return

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert("CSVファイルを選択してください")
      return
    }

    // Check file size limit
    if (file.size > MAX_FILE_SIZE_FOR_DETECTION) {
      alert(`ファイルサイズが大きすぎます。最大${MAX_FILE_SIZE_FOR_DETECTION / (1024 * 1024)}MBまで対応しています。`)
      return
    }

    setDetectingColumns(true)

    try {
      // Client-side header detection for all files (faster and no size limit issues)
      const { headers, encoding } = await readCSVHeaderClientSide(file)

      // Limit columns to 100
      const limitedHeaders = headers.slice(0, 100)

      setMapping({
        sampleHeaders: limitedHeaders,
        columnMappings: {},
        totalColumns: limitedHeaders.length,
        isConfigured: false,
        sampleFileName: file.name,
      })
      setPendingMappings({})

      // Show info about detected encoding
      console.log(`CSV header detected: ${limitedHeaders.length} columns, encoding: ${encoding}`)

      if (headers.length > 100) {
        alert(`CSVに${headers.length}列ありますが、最大100列までしか表示されません。`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "カラム検出中にエラーが発生しました"
      alert(errorMessage)
    } finally {
      setDetectingColumns(false)
      if (mappingFileInputRef.current) {
        mappingFileInputRef.current.value = ""
      }
    }
  }

  const handleMappingChange = (systemField: string, columnIndex: number | null) => {
    setPendingMappings(prev => ({
      ...prev,
      [systemField]: columnIndex,
    }))
  }

  const saveMapping = async () => {
    if (!selectedClientId || !mapping) return

    // Validate required fields
    const requiredFields = SYSTEM_FIELDS.filter(f => f.required)
    const missingRequired = requiredFields.filter(f => pendingMappings[f.key] === undefined || pendingMappings[f.key] === null)

    if (missingRequired.length > 0) {
      alert(`必須項目が未設定です: ${missingRequired.map(f => f.label).join(", ")}`)
      return
    }

    setSavingMapping(true)

    try {
      const res = await fetch(`/api/admin/clients/${selectedClientId}/column-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleHeaders: mapping.sampleHeaders,
          columnMappings: pendingMappings,
          sampleFileName: mapping.sampleFileName,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setMapping(data.mapping)
        alert("マッピング設定を保存しました")
      } else {
        const data = await res.json()
        alert(data.error || "保存に失敗しました")
      }
    } catch {
      alert("保存中にエラーが発生しました")
    } finally {
      setSavingMapping(false)
    }
  }

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClientId) return

    setUploading(true)
    setResult(null)
    setImportProgress(null)
    setUploadProgress(0)
    setImportLogId(null)

    const isLarge = file.size > LARGE_FILE_THRESHOLD
    setIsLargeFile(isLarge)

    try {
      if (isLarge) {
        // Large file: Use Vercel Blob client upload
        await handleLargeFileUpload(file)
      } else {
        // Small file: Use existing API
        await handleSmallFileUpload(file)
      }
    } catch (err) {
      console.error("Upload error:", err)
      setResult({ success: false, error: "アップロード中にエラーが発生しました" })
      setUploading(false)
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = ""
      }
    }
  }

  const handleSmallFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("clientId", String(selectedClientId))

    const res = await fetch("/api/admin/import/products", {
      method: "POST",
      body: formData,
    })

    const data = await res.json()
    setResult(data)
    setUploading(false)
  }

  const handleLargeFileUpload = async (file: File) => {
    try {
      // Step 1: Upload to Vercel Blob
      setUploadProgress(0)

      const blob = await upload(`products/${selectedClientId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/import/products/init",
        onUploadProgress: (progress) => {
          setUploadProgress(Math.round((progress.loaded / progress.total) * 100))
        },
      })

      setUploadProgress(100)

      // Step 2: Enqueue for background processing
      const enqueueRes = await fetch("/api/admin/import/products/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          clientId: selectedClientId,
          fileName: file.name,
          fileSize: file.size,
        }),
      })

      const enqueueData = await enqueueRes.json()

      if (!enqueueData.success) {
        throw new Error(enqueueData.error || "キュー登録に失敗しました")
      }

      setImportLogId(enqueueData.importLogId)

      // Step 3: Start polling for progress
      pollingRef.current = setInterval(() => {
        pollImportProgress(enqueueData.importLogId)
      }, 3000)

      // Initial poll
      pollImportProgress(enqueueData.importLogId)

    } catch (err) {
      throw err
    }
  }

  const selectedClient = clients.find(c => c.id === selectedClientId)

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-black">読み込み中...</div>
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">商品マスターインポート</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">クライアントのCSVカラムマッピング設定と商品マスターインポート</p>
        </div>

        {/* Client Selection */}
        <Card title="クライアント選択" className="mb-6">
          <select
            value={selectedClientId || ""}
            onChange={e => setSelectedClientId(Number(e.target.value))}
            className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.clientCode} - {client.clientName}
              </option>
            ))}
          </select>
        </Card>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("mapping")}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "mapping"
                  ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              カラムマッピング設定
            </button>
            <button
              onClick={() => setActiveTab("import")}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "import"
                  ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              CSVインポート
            </button>
          </nav>
        </div>

        {/* Mapping Tab */}
        {activeTab === "mapping" && (
          <div className="space-y-6">
            {/* Mapping Status */}
            <Card title="マッピング状態">
              {mappingLoading ? (
                <div className="text-gray-500 dark:text-gray-400">読み込み中...</div>
              ) : mapping?.isConfigured ? (
                <div className="flex items-center gap-3">
                  <StatusBadge status="success">設定済み</StatusBadge>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {mapping.totalColumns}列のCSVに対応 ({mapping.sampleFileName})
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <StatusBadge status="warning">未設定</StatusBadge>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    サンプルCSVをアップロードしてカラムマッピングを設定してください
                  </span>
                </div>
              )}
            </Card>

            {/* Sample CSV Upload */}
            <Card title="サンプルCSVアップロード">
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  クライアントが使用するCSVファイルのサンプルをアップロードしてください。
                  ヘッダー行を読み取り、カラム一覧を表示します。
                </p>
                <div className="flex items-center gap-3">
                  <input
                    ref={mappingFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleSampleFileSelect}
                    disabled={detectingColumns}
                    className="text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50 disabled:opacity-50"
                  />
                  {detectingColumns && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
                      検出中...
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Column Mapping Configuration */}
            {mapping && mapping.sampleHeaders.length > 0 && (
              <Card title={`カラムマッピング設定 (${mapping.sampleHeaders.length}列検出)`}>
                <div className="space-y-4">
                  {/* CSV Headers Preview */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">検出されたCSVカラム</div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto">
                      <div className="flex gap-2 min-w-max">
                        {mapping.sampleHeaders.map((header, index) => (
                          <div key={index} className="flex flex-col items-center">
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">#{index + 1}</div>
                            <div className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono truncate max-w-[120px] text-gray-900 dark:text-white" title={header}>
                              {header || "(空)"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* System Field Mappings */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">システム項目へのマッピング</div>
                    <div className="space-y-3">
                      {SYSTEM_FIELDS.map(field => (
                        <div key={field.key} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="w-48 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{field.label}</span>
                              {field.required && (
                                <span className="text-xs text-red-600 dark:text-red-400 font-medium">必須</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{field.description}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 dark:text-gray-500">→</span>
                            <select
                              value={pendingMappings[field.key] ?? ""}
                              onChange={e => handleMappingChange(field.key, e.target.value === "" ? null : Number(e.target.value))}
                              className={`w-64 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white ${
                                field.required && (pendingMappings[field.key] === undefined || pendingMappings[field.key] === null)
                                  ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                                  : "border-gray-300 dark:border-gray-700"
                              }`}
                            >
                              <option value="">-- 未設定 --</option>
                              {mapping.sampleHeaders.map((header, index) => (
                                <option key={index} value={index}>
                                  #{index + 1}: {header || "(空)"}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={saveMapping}
                      disabled={savingMapping}
                      className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingMapping ? "保存中..." : "マッピング設定を保存"}
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Import Tab */}
        {activeTab === "import" && (
          <div className="space-y-6">
            {/* Mapping Check */}
            {!mapping?.isConfigured && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <div className="font-medium text-yellow-800 dark:text-yellow-300">カラムマッピングが未設定です</div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                      インポート前に「カラムマッピング設定」タブでCSVカラムのマッピングを設定してください。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Large file support info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="font-medium text-blue-800 dark:text-blue-300">大容量ファイル対応</div>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    4MB以上のファイルは自動的にバックグラウンドで処理されます。
                    処理中はこのページで進捗を確認できます。
                  </p>
                </div>
              </div>
            </div>

            {/* Import Section */}
            <Card title="CSVインポート">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CSVファイル</label>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleImportFileSelect}
                    disabled={uploading || !selectedClientId || !mapping?.isConfigured}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50 disabled:opacity-50"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    設定されたマッピングに基づいてCSVをインポートします（最大100MB）
                  </p>
                </div>

                {mapping?.isConfigured && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">現在のマッピング設定</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {SYSTEM_FIELDS.filter(f => pendingMappings[f.key] !== undefined && pendingMappings[f.key] !== null).map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-gray-600 dark:text-gray-400">{field.label}:</span>
                          <span className="font-mono text-gray-900 dark:text-white">
                            #{(pendingMappings[field.key] ?? 0) + 1} {mapping.sampleHeaders[pendingMappings[field.key] ?? 0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Upload Progress */}
            {uploading && (
              <Card title="処理中">
                <div className="space-y-4">
                  {/* Upload phase */}
                  {isLargeFile && uploadProgress < 100 && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">ファイルアップロード中...</span>
                        <span className="text-gray-900 dark:text-white font-medium">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Processing phase */}
                  {(isLargeFile && uploadProgress >= 100) || importProgress ? (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">
                          {importProgress?.status === "pending" ? "処理待機中..." :
                           importProgress?.status === "processing" ? "データ処理中..." :
                           "処理中..."}
                        </span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {importProgress?.totalRows ? (
                            `${importProgress.lastProcessedRow.toLocaleString()} / ${importProgress.totalRows.toLocaleString()} (${importProgress.progress}%)`
                          ) : (
                            "準備中..."
                          )}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress?.progress || 0}%` }}
                        ></div>
                      </div>
                      {importProgress && (
                        <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                          <div className="text-center">
                            <div className="text-gray-500 dark:text-gray-400">新規登録</div>
                            <div className="text-green-600 dark:text-green-400 font-medium">
                              {(importProgress.insertedRows || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500 dark:text-gray-400">更新</div>
                            <div className="text-blue-600 dark:text-blue-400 font-medium">
                              {(importProgress.updatedRows || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500 dark:text-gray-400">エラー</div>
                            <div className="text-red-600 dark:text-red-400 font-medium">
                              {(importProgress.errorRows || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                      {isLargeFile && (
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                          大容量ファイルはバックグラウンドで処理されます。このページを閉じても処理は継続されます。
                        </p>
                      )}
                    </div>
                  ) : !isLargeFile && (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400"></div>
                      <span className="text-gray-600 dark:text-gray-400">CSVをインポート中...</span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Result */}
            {result && (
              <Card title="インポート結果">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={result.success ? "success" : "error"}>
                      {result.success ? "完了" : "エラー"}
                    </StatusBadge>
                    {result.error && <span className="text-red-600 dark:text-red-400 text-sm">{result.error}</span>}
                  </div>

                  {result.success && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <div className="text-xs text-gray-500 dark:text-gray-400">合計行数</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">{result.totalRows?.toLocaleString()}</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                        <div className="text-xs text-gray-500 dark:text-gray-400">新規登録</div>
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">{result.insertedRows?.toLocaleString()}</div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                        <div className="text-xs text-gray-500 dark:text-gray-400">更新</div>
                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{result.updatedRows?.toLocaleString()}</div>
                      </div>
                      {result.errorRows !== undefined && result.errorRows > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
                          <div className="text-xs text-gray-500 dark:text-gray-400">エラー</div>
                          <div className="text-lg font-semibold text-red-600 dark:text-red-400">{result.errorRows}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {result.errors && result.errors.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">エラー詳細 (最初の10件)</div>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 max-h-40 overflow-y-auto">
                        <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
                          {result.errors.map((err, i) => (
                            <li key={i}>
                              {err.row > 0 ? `行 ${err.row}: ` : ""}{err.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
