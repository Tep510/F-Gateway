'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModernHeader from '@/app/components/ModernHeader'
import Card from '@/app/components/Card'
import StatusBadge from '@/app/components/StatusBadge'

interface UploadLog {
  id: number
  fileName: string
  fileSize: number
  rowCount: number | null
  status: string
  uploadedAt: string
  errorMessage: string | null
}

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
  const [logs, setLogs] = useState<UploadLog[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/')
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchLogs()
    }
  }, [status])

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/client/upload?type=receiving')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLoading(false)
    }
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
        fetchLogs()
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

  const successCount = logs.filter(l => l.status === 'completed').length
  const errorCount = logs.filter(l => l.status === 'failed').length

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        userEmail={session.user.email || ""}
        role={session.user.role}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">入庫</h1>
          <p className="text-gray-600 mt-1">入庫データの確認と管理</p>
        </div>

        {/* Summary */}
        <Card title="今月の入庫サマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600">総入庫回数</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">{logs.length}回</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">成功</div>
              <div className="text-3xl font-bold text-green-600 mt-1">{successCount}回</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">エラー</div>
              <div className="text-3xl font-bold text-red-600 mt-1">{errorCount}回</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">合計サイズ</div>
              <div className="text-3xl font-bold text-blue-600 mt-1">
                {formatFileSize(logs.reduce((sum, l) => sum + l.fileSize, 0))}
              </div>
            </div>
          </div>
        </Card>

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mb-6 p-4 rounded-lg ${uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2">
              {uploadResult.success ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-800">{uploadResult.message}</span>
                  <span className="text-green-600 text-sm ml-2">({uploadResult.rowCount}行)</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-red-800">{uploadResult.error}</span>
                </>
              )}
              <button
                onClick={() => setUploadResult(null)}
                className="ml-auto text-gray-400 hover:text-gray-600"
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
              ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
              ${uploading ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600">アップロード中...</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-2 text-gray-600">入庫CSVファイルをここにドロップ</p>
                <p className="text-gray-400 text-sm mt-1">または下のボタンでファイルを選択</p>
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
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">日時</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ファイル名</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">サイズ</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">行数</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      アップロード履歴がありません
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {new Date(log.uploadedAt).toLocaleString('ja-JP')}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 font-mono">{log.fileName}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 text-right">
                        {formatFileSize(log.fileSize)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 text-right">
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
