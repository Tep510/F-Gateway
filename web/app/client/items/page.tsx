'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModernHeader from '@/app/components/ModernHeader'
import Card from '@/app/components/Card'
import StatusBadge from '@/app/components/StatusBadge'

interface Product {
  id: number
  productCode: string
  productName: string
  costPrice: number
  janCode: string | null
  updatedAt: string
}

interface ImportResult {
  success: boolean
  totalRows?: number
  insertedRows?: number
  updatedRows?: number
  errorRows?: number
  errors?: { row: number; error: string }[]
  error?: string
}

export default function ItemsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/')
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchProducts()
    }
  }, [status])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/client/products')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setImportResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/client/import/products', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      setImportResult(data)

      if (data.success) {
        // Refresh products list
        fetchProducts()
      }
    } catch {
      setImportResult({ success: false, error: 'アップロード中にエラーが発生しました' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchTerm ||
      p.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.janCode && p.janCode.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesSearch
  })

  const totalCostValue = products.reduce((sum, p) => sum + Number(p.costPrice), 0)

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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">商品マスタ</h1>
            <p className="text-gray-600 mt-1">商品データの確認と管理</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500">総商品数</div>
              <div className="text-sm font-medium text-gray-700">{products.length}件</div>
            </div>
            <StatusBadge status="success">同期済み</StatusBadge>
          </div>
        </div>

        {/* Summary */}
        <Card title="商品マスタサマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600">総商品数</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">{products.length}品</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">アクティブ商品</div>
              <div className="text-3xl font-bold text-green-600 mt-1">{products.length}品</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">原価合計</div>
              <div className="text-3xl font-bold text-purple-600 mt-1">{totalCostValue.toLocaleString()}円</div>
            </div>
          </div>
        </Card>

        {/* Item List */}
        <Card title="商品一覧">
          <div className="mb-4 flex items-center justify-between">
            <input
              type="text"
              placeholder="商品コード・名称・JANコードで検索"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
            >
              CSVインポート
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">商品コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">商品名</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">原価</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">JANコード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">最終更新</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      {products.length === 0 ? '商品データがありません。CSVインポートで登録してください。' : '該当する商品がありません'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm font-mono text-gray-900">{product.productCode}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{product.productName}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900">
                        {Number(product.costPrice).toLocaleString()}円
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-600">
                        {product.janCode || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(product.updatedAt).toLocaleDateString('ja-JP')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">CSVインポート</h2>
              <button
                onClick={() => { setShowImportModal(false); setImportResult(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              {!importResult ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">CSVファイルを選択</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      disabled={uploading}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                  </div>

                  {uploading && (
                    <div className="flex items-center gap-3 text-blue-600">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span>インポート中...</span>
                    </div>
                  )}

                  <div className="text-sm text-gray-500">
                    <p className="font-medium mb-1">対応フォーマット:</p>
                    <p>Shift-JIS / UTF-8 エンコーディングのCSV</p>
                    <p className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded">
                      商品コード, 商品名, 在庫数, 原価, 売価, ...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={importResult.success ? "success" : "error"}>
                      {importResult.success ? "完了" : "エラー"}
                    </StatusBadge>
                    {importResult.error && <span className="text-red-600 text-sm">{importResult.error}</span>}
                  </div>

                  {importResult.success && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 p-3 rounded text-center">
                        <div className="text-xs text-gray-500">合計</div>
                        <div className="text-lg font-semibold">{importResult.totalRows}</div>
                      </div>
                      <div className="bg-green-50 p-3 rounded text-center">
                        <div className="text-xs text-gray-500">新規</div>
                        <div className="text-lg font-semibold text-green-600">{importResult.insertedRows}</div>
                      </div>
                      <div className="bg-blue-50 p-3 rounded text-center">
                        <div className="text-xs text-gray-500">更新</div>
                        <div className="text-lg font-semibold text-blue-600">{importResult.updatedRows}</div>
                      </div>
                    </div>
                  )}

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="bg-red-50 rounded p-3 max-h-32 overflow-y-auto">
                      <div className="text-sm font-medium text-red-700 mb-1">エラー詳細:</div>
                      <ul className="text-xs text-red-600 space-y-1">
                        {importResult.errors.map((err, i) => (
                          <li key={i}>行 {err.row}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={() => { setShowImportModal(false); setImportResult(null); }}
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
