'use client'

import { useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModernHeader from '@/app/components/ModernHeader'
import Card from '@/app/components/Card'
import StatusBadge from '@/app/components/StatusBadge'
import { useClientUploadLogs } from '@/lib/hooks'

interface UploadResult {
  success: boolean
  newFileName?: string
  rowCount?: number
  message?: string
  error?: string
}

export default function ReceivingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { logs, isLoading, mutate } = useClientUploadLogs('receiving')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Redirect if unauthenticated
  if (status === 'unauthenticated') {
    router.replace('/')
    return null
  }

  // Show minimal loading only for initial session check
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="h-14 border-b border-gray-200 dark:border-gray-800" />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-gray-100 dark:bg-gray-900 rounded-lg" />
            <div className="h-48 bg-gray-100 dark:bg-gray-900 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setUploadResult({ success: false, error: 'CSVファイルのみアップロード可能です' })
      return
    }

    setUploading(true)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'receiving')

    try {
      const res = await fetch('/api/client/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      setUploadResult(data)

      if (data.success) {
        mutate()
      }
    } catch {
      setUploadResult({ success: false, error: 'アップロード中にエラーが発生しました' })
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleUpload(file)
    }
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const successCount = logs.filter((l: { status: string }) => l.status === 'completed').length
  const errorCount = logs.filter((l: { status: string }) => l.status === 'failed').length

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        clientName={session.user.clientName}
        userEmail={session.user.email || ""}
        role={session.user.role}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">入庫</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">入庫データの確認と管理</p>
        </div>

        {/* Summary */}
        <Card title="今月の入庫サマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">総入庫回数</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {isLoading ? '-' : logs.length}回
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">成功</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                {isLoading ? '-' : successCount}回
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">エラー</div>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                {isLoading ? '-' : errorCount}回
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">合計サイズ</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {isLoading ? '-' : formatFileSize(logs.reduce((sum: number, l: { fileSize: number }) => sum + l.fileSize, 0))}
              </div>
            </div>
          </div>
        </Card>

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mb-6 p-4 rounded-lg ${uploadResult.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
            <div className="flex items-center gap-2">
              {uploadResult.success ? (
                <>
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-800 dark:text-green-300">{uploadResult.message}</span>
                  <span className="text-green-600 dark:text-green-400 text-sm ml-2">({uploadResult.rowCount}行)</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-red-800 dark:text-red-300">{uploadResult.error}</span>
                </>
              )}
              <button
                onClick={() => setUploadResult(null)}
                className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Upload Area */}
        <Card title="CSVアップロード" className="mb-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}
              ${uploading ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
                <p className="text-gray-600 dark:text-gray-400">アップロード中...</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-2 text-gray-600 dark:text-gray-400">入庫CSVファイルをここにドロップ</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">または下のボタンでファイルを選択</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
                >
                  ファイル選択
                </button>
              </>
            )}
          </div>
        </Card>

        {/* Upload History */}
        <Card title="入庫履歴">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">日時</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">ファイル名</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">サイズ</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">行数</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      読み込み中...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      アップロード履歴がありません
                    </td>
                  </tr>
                ) : (
                  logs.map((log: { id: number; uploadedAt: string; fileName: string; fileSize: number; rowCount: number | null; status: string }) => (
                    <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {new Date(log.uploadedAt).toLocaleString('ja-JP')}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 font-mono">{log.fileName}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 text-right">
                        {formatFileSize(log.fileSize)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 text-right">
                        {log.rowCount != null ? log.rowCount.toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <StatusBadge status={log.status === 'completed' ? 'success' : 'error'}>
                          {log.status === 'completed' ? '完了' : 'エラー'}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  )
}
