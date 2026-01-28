"use client"

import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"

interface Client {
  id: number
  clientCode: string
  clientName: string
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

export default function AdminImport() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClientId) return

    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("clientId", String(selectedClientId))

    try {
      const res = await fetch("/api/admin/import/products", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ success: false, error: "アップロード中にエラーが発生しました" })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">商品マスターインポート</h1>
          <p className="text-gray-600 mt-1">クライアントの商品マスターCSVをインポート</p>
        </div>

        <Card title="インポート設定" className="mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">クライアント</label>
              <select
                value={selectedClientId || ""}
                onChange={e => setSelectedClientId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.clientCode} - {client.clientName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CSVファイル</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={uploading || !selectedClientId}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-gray-500">
                商品コード、商品名、仕入先コード、在庫数、原価、売価などを含むCSV
              </p>
            </div>
          </div>
        </Card>

        {uploading && (
          <Card title="処理中" className="mb-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">CSVをインポート中...</span>
            </div>
          </Card>
        )}

        {result && (
          <Card title="インポート結果" className="mb-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusBadge status={result.success ? "success" : "error"}>
                  {result.success ? "完了" : "エラー"}
                </StatusBadge>
                {result.error && <span className="text-red-600 text-sm">{result.error}</span>}
              </div>

              {result.success && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-xs text-gray-500">合計行数</div>
                    <div className="text-lg font-semibold">{result.totalRows?.toLocaleString()}</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-xs text-gray-500">新規登録</div>
                    <div className="text-lg font-semibold text-green-600">{result.insertedRows?.toLocaleString()}</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="text-xs text-gray-500">更新</div>
                    <div className="text-lg font-semibold text-blue-600">{result.updatedRows?.toLocaleString()}</div>
                  </div>
                  {result.errorRows !== undefined && result.errorRows > 0 && (
                    <div className="bg-red-50 p-3 rounded">
                      <div className="text-xs text-gray-500">エラー</div>
                      <div className="text-lg font-semibold text-red-600">{result.errorRows}</div>
                    </div>
                  )}
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">エラー詳細 (最初の10件)</div>
                  <div className="bg-red-50 rounded p-3 max-h-40 overflow-y-auto">
                    <ul className="text-sm text-red-700 space-y-1">
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

        <Card title="対応フォーマット">
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-medium text-gray-900 mb-1">商品マスター (MNG形式)</div>
              <p className="text-gray-600 mb-2">
                Shift-JIS または UTF-8 エンコーディングのCSVファイル。
              </p>
              <div className="bg-gray-50 p-2 rounded font-mono text-xs overflow-x-auto">
                商品コード, 商品名, 仕入先コード, 仕入先名, 在庫数, 原価, 売価, JANコード, ...
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="font-medium text-gray-900 mb-2">必須カラム</div>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li><code className="text-xs bg-gray-100 px-1 rounded">商品コード</code> - 商品を一意に識別するコード</li>
                <li><code className="text-xs bg-gray-100 px-1 rounded">商品名</code> - 商品の名称</li>
              </ul>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
