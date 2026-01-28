"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"

interface LogEntry {
  id: number
  client: { clientCode: string; clientName: string }
  [key: string]: any
}

export default function AdminLogs() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [logs, setLogs] = useState<{ [key: string]: LogEntry[] }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logType, setLogType] = useState("all")

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("この画面には「管理者」ロールが必要です。")
      router.replace("/client")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status !== "authenticated") return
    setLoading(true)
    fetch(`/api/admin/logs?type=${logType}&limit=30`)
      .then(res => res.json())
      .then(data => { setLogs(data.logs || {}); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [status, logType])

  const getStatusBadge = (status: string) => {
    if (status === "success" || status === "completed") return <StatusBadge status="success">完了</StatusBadge>
    if (status === "error" || status === "failed") return <StatusBadge status="error">エラー</StatusBadge>
    if (status === "pending" || status === "processing") return <StatusBadge status="warning">処理中</StatusBadge>
    return <StatusBadge status="info">{status}</StatusBadge>
  }

  const logTypeLabels: { [key: string]: string } = {
    all: "全ログ",
    csv_upload: "CSVアップロード",
    product_import: "商品マスタ",
    csv_conversion: "CSV変換",
    file_transfer: "ファイル転送",
    asana_notification: "Asana通知",
    item_import: "商品インポート",
  }

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600">エラー: {error}</div>

  const renderCsvUploads = () => logs.csvUploads?.length ? (
    <Card title="CSVアップロード" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ファイル名</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ステータス</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">日時</th>
        </tr></thead>
        <tbody>{logs.csvUploads.map(log => (
          <tr key={log.id} className="border-b border-gray-100">
            <td className="py-2 px-3 text-sm text-gray-700">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700">{log.fileName}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.uploadStatus)}</td>
            <td className="py-2 px-3 text-sm text-gray-500">{new Date(log.uploadedAt).toLocaleString("ja-JP")}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderCsvConversions = () => logs.csvConversions?.length ? (
    <Card title="CSV変換" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ソースファイル</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ステータス</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">総行数</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">成功</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">エラー</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">日時</th>
        </tr></thead>
        <tbody>{logs.csvConversions.map(log => (
          <tr key={log.id} className="border-b border-gray-100">
            <td className="py-2 px-3 text-sm text-gray-700">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 font-mono truncate max-w-[200px]" title={log.sourceFileName}>{log.sourceFileName}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.conversionStatus)}</td>
            <td className="py-2 px-3 text-sm text-right text-gray-700">{log.totalRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-green-600">{log.successRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-red-600">{log.errorRows || "-"}</td>
            <td className="py-2 px-3 text-sm text-gray-500">{new Date(log.startedAt).toLocaleString("ja-JP")}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderFileTransfers = () => logs.fileTransfers?.length ? (
    <Card title="ファイル転送" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">転送種別</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ステータス</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">日時</th>
        </tr></thead>
        <tbody>{logs.fileTransfers.map(log => (
          <tr key={log.id} className="border-b border-gray-100">
            <td className="py-2 px-3 text-sm text-gray-700">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700">{log.transferType}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.transferStatus)}</td>
            <td className="py-2 px-3 text-sm text-gray-500">{new Date(log.startedAt).toLocaleString("ja-JP")}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderAsanaNotifications = () => logs.asanaNotifications?.length ? (
    <Card title="Asana通知" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">通知種別</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ステータス</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">日時</th>
        </tr></thead>
        <tbody>{logs.asanaNotifications.map(log => (
          <tr key={log.id} className="border-b border-gray-100">
            <td className="py-2 px-3 text-sm text-gray-700">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700">{log.notificationType}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.notificationStatus)}</td>
            <td className="py-2 px-3 text-sm text-gray-500">{new Date(log.sentAt).toLocaleString("ja-JP")}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderItemImports = () => logs.itemImports?.length ? (
    <Card title="商品インポート" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">インポート元</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ステータス</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">商品数</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">日時</th>
        </tr></thead>
        <tbody>{logs.itemImports.map(log => (
          <tr key={log.id} className="border-b border-gray-100">
            <td className="py-2 px-3 text-sm text-gray-700">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700">{log.importSource}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.importStatus)}</td>
            <td className="py-2 px-3 text-sm text-right text-gray-700">{log.totalItems || "-"}</td>
            <td className="py-2 px-3 text-sm text-gray-500">{new Date(log.startedAt).toLocaleString("ja-JP")}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderProductImports = () => logs.productImports?.length ? (
    <Card title="商品マスタインポート" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ファイル名</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">ステータス</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">総行数</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">追加</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">更新</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">エラー</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">日時</th>
        </tr></thead>
        <tbody>{logs.productImports.map(log => (
          <tr key={log.id} className="border-b border-gray-100">
            <td className="py-2 px-3 text-sm text-gray-700">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 font-mono truncate max-w-[200px]" title={log.fileName}>{log.fileName}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.importStatus)}</td>
            <td className="py-2 px-3 text-sm text-right text-gray-700">{log.totalRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-green-600">{log.insertedRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-blue-600">{log.updatedRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-red-600">{log.errorRows || "-"}</td>
            <td className="py-2 px-3 text-sm text-gray-500">{new Date(log.startedAt).toLocaleString("ja-JP")}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const hasAnyLogs = Object.values(logs).some(arr => arr?.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ログ</h1>
          <p className="text-gray-600 mt-1">システム動作ログの確認</p>
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {Object.entries(logTypeLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLogType(key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                logType === key ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Logs */}
        <div className="overflow-x-auto">
          {renderCsvUploads()}
          {renderCsvConversions()}
          {renderProductImports()}
          {renderFileTransfers()}
          {renderAsanaNotifications()}
          {renderItemImports()}
          {!hasAnyLogs && (
            <div className="text-center py-12 text-gray-400">ログがありません</div>
          )}
        </div>
      </main>
    </div>
  )
}
