'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModernHeader from '@/app/components/ModernHeader'
import Card from '@/app/components/Card'
import StatusBadge from '@/app/components/StatusBadge'
import { useClientProducts } from '@/lib/hooks'
import { upload } from '@vercel/blob/client'

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
  completedAt: string | null
  errorDetails: { row: number; error: string }[] | null
}

// Large file threshold (4MB - below Vercel's 4.5MB limit)
const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024

// Maximum file size (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024

// Page size options
const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000]
const DEFAULT_PAGE_SIZE = 250

function ItemsContent({ session }: { session: NonNullable<ReturnType<typeof useSession>['data']> }) {
  // Pagination state
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Use debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchTerm) {
        setSearchTerm(searchInput)
        setPage(1) // Reset to first page on search
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, searchTerm])

  const { products, pagination, isLoading, mutate } = useClientProducts({
    page,
    limit,
    search: searchTerm,
  })

  const [uploading, setUploading] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Large file upload state
  const [isLargeFile, setIsLargeFile] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const pollImportProgress = async (logId: number) => {
    try {
      const res = await fetch(`/api/client/import/products/status/${logId}`)
      if (res.ok) {
        const data: ImportProgress = await res.json()
        setImportProgress(data)

        if (data.status === 'completed' || data.status === 'failed') {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setUploading(false)
          setImportResult({
            success: data.status === 'completed',
            importLogId: data.id,
            totalRows: data.totalRows || 0,
            insertedRows: data.insertedRows || 0,
            updatedRows: data.updatedRows || 0,
            errorRows: data.errorRows || 0,
            errors: data.errorDetails ? data.errorDetails.slice(0, 10) : [],
          })
          mutate()
        }
      }
    } catch (err) {
      console.error('Polling error:', err)
    }
  }

  const handleSmallFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/client/import/products', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      let errorMessage = 'サーバーエラーが発生しました'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorMessage
      } catch {
        if (res.status === 413) {
          errorMessage = 'ファイルサイズが大きすぎます。'
        }
      }
      throw new Error(errorMessage)
    }

    const data = await res.json()
    setImportResult(data)

    if (data.success) {
      mutate()
    }
  }

  const handleLargeFileUpload = async (file: File) => {
    // Step 1: Upload to Vercel Blob
    setUploadProgress(0)

    const timestamp = Date.now()
    const blob = await upload(`client-products/${timestamp}-${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/client/import/products/init',
      onUploadProgress: (progress) => {
        setUploadProgress(Math.round((progress.loaded / progress.total) * 100))
      },
    })

    setUploadProgress(100)

    // Step 2: Enqueue for background processing
    const enqueueRes = await fetch('/api/client/import/products/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
      }),
    })

    const enqueueData = await enqueueRes.json()

    if (!enqueueData.success) {
      throw new Error(enqueueData.error || 'キュー登録に失敗しました')
    }

    // Step 3: Start polling for progress
    pollingRef.current = setInterval(() => {
      pollImportProgress(enqueueData.importLogId)
    }, 3000)

    // Initial poll
    pollImportProgress(enqueueData.importLogId)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check maximum file size
    if (file.size > MAX_FILE_SIZE) {
      setImportResult({
        success: false,
        error: `ファイルサイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。最大100MBまで対応しています。`
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setUploading(true)
    setImportResult(null)
    setImportProgress(null)
    setUploadProgress(0)

    const isLarge = file.size > LARGE_FILE_THRESHOLD
    setIsLargeFile(isLarge)

    try {
      if (isLarge) {
        // Large file: Use Vercel Blob client upload
        await handleLargeFileUpload(file)
      } else {
        // Small file: Use direct API upload
        await handleSmallFileUpload(file)
        setUploading(false)
      }
    } catch (err) {
      console.error('Upload error:', err)
      const errorMessage = err instanceof Error ? err.message : 'アップロード中にエラーが発生しました'
      setImportResult({ success: false, error: errorMessage })
      setUploading(false)
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleCloseModal = () => {
    // Stop polling if active
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setShowImportModal(false)
    setImportResult(null)
    setImportProgress(null)
    setUploadProgress(0)
    setIsLargeFile(false)
  }

  // Total count from pagination (server-side)
  const totalCount = pagination?.totalCount || 0

  // Cost value for current page only (full calculation would require server-side aggregation)
  const pageCostValue = products.reduce((sum: number, p: { costPrice: number }) => sum + Number(p.costPrice), 0)

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        clientName={session.user.clientName}
        userEmail={session.user.email || ""}
        role={session.user.role}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">商品マスタ</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">商品データの確認と管理</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">総商品数</div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isLoading ? '-' : `${totalCount.toLocaleString()}件`}
              </div>
            </div>
            <StatusBadge status="success">同期済み</StatusBadge>
          </div>
        </div>

        {/* Summary */}
        <Card title="商品マスタサマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">総商品数</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {isLoading ? '-' : `${totalCount.toLocaleString()}品`}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">表示中</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {isLoading ? '-' : `${products.length}品`}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">ページ</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                {isLoading ? '-' : `${pagination?.page || 1}/${pagination?.totalPages || 1}`}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">表示中の原価合計</div>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {isLoading ? '-' : `${pageCostValue.toLocaleString()}円`}
              </div>
            </div>
          </div>
        </Card>

        {/* Item List */}
        <Card title="商品一覧">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="商品コード・名称・JANコードで検索"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setSearchTerm(''); setPage(1); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">表示件数:</label>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size}件</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                CSVインポート
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">商品コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">商品名</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">原価</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">JANコード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">最終更新</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      読み込み中...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {totalCount === 0 ? '商品データがありません。CSVインポートで登録してください。' : '該当する商品がありません'}
                    </td>
                  </tr>
                ) : (
                  products.map((product: { id: number; productCode: string; productName: string; costPrice: number; janCode: string | null; updatedAt: string }) => (
                    <tr key={product.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-white">{product.productCode}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{product.productName}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                        {Number(product.costPrice).toLocaleString()}円
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-600 dark:text-gray-400">
                        {product.janCode || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(product.updatedAt).toLocaleDateString('ja-JP')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {((page - 1) * limit + 1).toLocaleString()} - {Math.min(page * limit, totalCount).toLocaleString()} / {totalCount.toLocaleString()}件
              </div>
              <div className="flex items-center gap-2">
                {/* First Page */}
                <button
                  onClick={() => setPage(1)}
                  disabled={!pagination.hasPrevPage}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  最初
                </button>
                {/* Prev Page */}
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={!pagination.hasPrevPage}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  前へ
                </button>
                {/* Page Input */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={pagination.totalPages}
                    value={page}
                    onChange={(e) => {
                      const newPage = Math.max(1, Math.min(pagination.totalPages, parseInt(e.target.value) || 1))
                      setPage(newPage)
                    }}
                    className="w-16 px-2 py-1 text-sm text-center border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">/ {pagination.totalPages}</span>
                </div>
                {/* Next Page */}
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!pagination.hasNextPage}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  次へ
                </button>
                {/* Last Page */}
                <button
                  onClick={() => setPage(pagination.totalPages)}
                  disabled={!pagination.hasNextPage}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  最後
                </button>
              </div>
            </div>
          )}
        </Card>
      </main>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">CSVインポート</h2>
              <button
                onClick={handleCloseModal}
                disabled={uploading && isLargeFile}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              {!importResult && !uploading ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CSVファイルを選択</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      disabled={uploading}
                      className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50 disabled:opacity-50"
                    />
                  </div>

                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    <p className="font-medium mb-1">対応フォーマット:</p>
                    <p>Shift-JIS / UTF-8 エンコーディングのCSV</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">※大容量ファイル対応（最大100MB）</p>
                    <p className="mt-2 text-xs font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded text-gray-700 dark:text-gray-300">
                      商品コード, 商品名, 在庫数, 原価, 売価, ...
                    </p>
                  </div>
                </div>
              ) : uploading ? (
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
                          {importProgress?.status === 'pending' ? '処理待機中...' :
                           importProgress?.status === 'processing' ? 'データ処理中...' :
                           '処理中...'}
                        </span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {importProgress?.totalRows ? (
                            `${importProgress.lastProcessedRow.toLocaleString()} / ${importProgress.totalRows.toLocaleString()} (${importProgress.progress}%)`
                          ) : (
                            '準備中...'
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
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        大容量ファイルはバックグラウンドで処理されます。このダイアログを閉じても処理は継続されます。
                      </p>
                    </div>
                  ) : !isLargeFile && (
                    <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400"></div>
                      <span>インポート中...</span>
                    </div>
                  )}
                </div>
              ) : importResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={importResult.success ? "success" : "error"}>
                      {importResult.success ? "完了" : "エラー"}
                    </StatusBadge>
                    {importResult.error && <span className="text-red-600 dark:text-red-400 text-sm">{importResult.error}</span>}
                  </div>

                  {importResult.success && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">合計</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">{importResult.totalRows?.toLocaleString()}</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">新規</div>
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">{importResult.insertedRows?.toLocaleString()}</div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">更新</div>
                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{importResult.updatedRows?.toLocaleString()}</div>
                      </div>
                    </div>
                  )}

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 max-h-32 overflow-y-auto">
                      <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">エラー詳細:</div>
                      <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                        {importResult.errors.map((err, i) => (
                          <li key={i}>行 {err.row}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={handleCloseModal}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ItemsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="h-14 border-b border-gray-200 dark:border-gray-800" />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-gray-100 dark:bg-gray-900 rounded-lg" />
            <div className="h-64 bg-gray-100 dark:bg-gray-900 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  // Redirect if unauthenticated
  if (status === 'unauthenticated' || !session?.user) {
    router.replace('/')
    return null
  }

  return <ItemsContent session={session} />
}
