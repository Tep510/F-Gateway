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

interface SystemLogEntry {
  id: number
  logLevel: string
  category: string
  action: string
  message: string
  clientId: number | null
  userId: string | null
  metadata: Record<string, unknown> | null
  errorMessage: string | null
  errorStack: string | null
  durationMs: number | null
  requestId: string | null
  createdAt: string
}

// 日本時間でフォーマット
const formatJST = (date: string | Date): string => {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
}

export default function AdminLogs() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [logs, setLogs] = useState<{ [key: string]: LogEntry[] }>({})
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([])
  const [systemLogStats, setSystemLogStats] = useState<{ categories: Record<string, number>; levels: Record<string, number> }>({ categories: {}, levels: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logType, setLogType] = useState("all")
  const [systemLogLevel, setSystemLogLevel] = useState("")
  const [systemLogCategory, setSystemLogCategory] = useState("")
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null)

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
    setError(null)

    if (logType === "system_log") {
      // Fetch system logs
      const params = new URLSearchParams({ limit: "100" })
      if (systemLogLevel) params.set("level", systemLogLevel)
      if (systemLogCategory) params.set("category", systemLogCategory)

      fetch(`/api/admin/logs/system?${params}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
          return res.json()
        })
        .then(data => {
          if (data.error) throw new Error(data.error)
          setSystemLogs(data.logs || [])
          setSystemLogStats(data.stats || { categories: {}, levels: {} })
          setLoading(false)
        })
        .catch(err => { setError(err.message); setLoading(false) })
    } else {
      // Fetch legacy logs
      fetch(`/api/admin/logs?type=${logType}&limit=30`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
          return res.json()
        })
        .then(data => {
          if (data.error) throw new Error(data.error)
          setLogs(data.logs || {})
          setLoading(false)
        })
        .catch(err => { setError(err.message); setLoading(false) })
    }
  }, [status, logType, systemLogLevel, systemLogCategory])

  const getStatusBadge = (status: string) => {
    if (status === "success" || status === "completed") return <StatusBadge status="success">完了</StatusBadge>
    if (status === "error" || status === "failed") return <StatusBadge status="error">エラー</StatusBadge>
    if (status === "pending" || status === "processing") return <StatusBadge status="warning">処理中</StatusBadge>
    return <StatusBadge status="info">{status}</StatusBadge>
  }

  const logTypeLabels: { [key: string]: string } = {
    system_log: "生ログ",
    all: "全ログ",
    csv_upload: "CSVアップロード",
    product_import: "商品マスタ",
    csv_conversion: "CSV変換",
    file_transfer: "ファイル転送",
    asana_notification: "Asana通知",
    item_import: "商品インポート",
  }

  const logLevelLabels: { [key: string]: { label: string; color: string } } = {
    debug: { label: "DEBUG", color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" },
    info: { label: "INFO", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" },
    warn: { label: "WARN", color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" },
    error: { label: "ERROR", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
  }

  const categoryLabels: { [key: string]: string } = {
    csv_upload: "CSVアップロード",
    csv_conversion: "CSV変換",
    product_import: "商品インポート",
    file_transfer: "ファイル転送",
    asana: "Asana",
    api: "API",
    auth: "認証",
    system: "システム",
    settings: "設定",
    cron: "定期処理",
  }

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-black">読み込み中...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 dark:text-red-400 bg-white dark:bg-black">エラー: {error}</div>

  const renderCsvUploads = () => logs.csvUploads?.length ? (
    <Card title="CSVアップロード" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ファイル名</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ステータス</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">日時</th>
        </tr></thead>
        <tbody>{logs.csvUploads.map(log => (
          <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.fileName}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.uploadStatus)}</td>
            <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{formatJST(log.uploadedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderCsvConversions = () => logs.csvConversions?.length ? (
    <Card title="CSV変換" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ソースファイル</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ステータス</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">総行数</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">成功</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">エラー</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">日時</th>
        </tr></thead>
        <tbody>{logs.csvConversions.map(log => (
          <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300 font-mono truncate max-w-[200px]" title={log.sourceFileName}>{log.sourceFileName}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.conversionStatus)}</td>
            <td className="py-2 px-3 text-sm text-right text-gray-700 dark:text-gray-300">{log.totalRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-green-600 dark:text-green-400">{log.successRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-red-600 dark:text-red-400">{log.errorRows || "-"}</td>
            <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{formatJST(log.startedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderFileTransfers = () => logs.fileTransfers?.length ? (
    <Card title="ファイル転送" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">転送種別</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ステータス</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">日時</th>
        </tr></thead>
        <tbody>{logs.fileTransfers.map(log => (
          <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.transferType}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.transferStatus)}</td>
            <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{formatJST(log.startedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderAsanaNotifications = () => logs.asanaNotifications?.length ? (
    <Card title="Asana通知" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">通知種別</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ステータス</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">日時</th>
        </tr></thead>
        <tbody>{logs.asanaNotifications.map(log => (
          <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.notificationType}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.notificationStatus)}</td>
            <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{formatJST(log.sentAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderItemImports = () => logs.itemImports?.length ? (
    <Card title="商品インポート" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">インポート元</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ステータス</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">商品数</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">日時</th>
        </tr></thead>
        <tbody>{logs.itemImports.map(log => (
          <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.importSource}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.importStatus)}</td>
            <td className="py-2 px-3 text-sm text-right text-gray-700 dark:text-gray-300">{log.totalItems || "-"}</td>
            <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{formatJST(log.startedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const renderProductImports = () => logs.productImports?.length ? (
    <Card title="商品マスタインポート" className="mb-4">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">クライアント</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ファイル名</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">ステータス</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">総行数</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">追加</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">更新</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">エラー</th>
          <th className="text-left py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400">日時</th>
        </tr></thead>
        <tbody>{logs.productImports.map(log => (
          <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{log.client.clientCode}</td>
            <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300 font-mono truncate max-w-[200px]" title={log.fileName}>{log.fileName}</td>
            <td className="py-2 px-3 text-sm">{getStatusBadge(log.importStatus)}</td>
            <td className="py-2 px-3 text-sm text-right text-gray-700 dark:text-gray-300">{log.totalRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-green-600 dark:text-green-400">{log.insertedRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-blue-600 dark:text-blue-400">{log.updatedRows?.toLocaleString() || "-"}</td>
            <td className="py-2 px-3 text-sm text-right text-red-600 dark:text-red-400">{log.errorRows || "-"}</td>
            <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{formatJST(log.startedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  ) : null

  const hasAnyLogs = Object.values(logs).some(arr => arr?.length > 0)

  const recordTestLog = async () => {
    try {
      const res = await fetch('/api/admin/logs/test', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        alert(`テストログを記録しました (RequestID: ${data.requestId})`)
        // リロードしてログを表示
        setLoading(true)
        const params = new URLSearchParams({ limit: "100" })
        const logsRes = await fetch(`/api/admin/logs/system?${params}`)
        const logsData = await logsRes.json()
        setSystemLogs(logsData.logs || [])
        setSystemLogStats(logsData.stats || { categories: {}, levels: {} })
        setLoading(false)
      } else {
        alert(`エラー: ${data.error}`)
      }
    } catch (err) {
      alert(`エラー: ${err}`)
    }
  }

  const renderSystemLogs = () => (
    <div>
      {/* System log filters */}
      <div className="mb-4 flex gap-4 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">レベル:</label>
          <select
            value={systemLogLevel}
            onChange={(e) => setSystemLogLevel(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          >
            <option value="">全て</option>
            {Object.entries(logLevelLabels).map(([key, { label }]) => (
              <option key={key} value={key}>{label} ({systemLogStats.levels[key] || 0})</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">カテゴリ:</label>
          <select
            value={systemLogCategory}
            onChange={(e) => setSystemLogCategory(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          >
            <option value="">全て</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label} ({systemLogStats.categories[key] || 0})</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {systemLogs.length} 件
        </div>
        <button
          onClick={recordTestLog}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
        >
          テストログ記録
        </button>
      </div>

      {/* System log table */}
      {systemLogs.length > 0 ? (
        <Card title="システムログ">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {systemLogs.map(log => (
              <div key={log.id} className="py-2 px-3">
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                >
                  <span className={`px-2 py-0.5 rounded text-xs font-mono ${logLevelLabels[log.logLevel]?.color || "bg-gray-100 dark:bg-gray-800"}`}>
                    {logLevelLabels[log.logLevel]?.label || log.logLevel.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
                    {formatJST(log.createdAt)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
                    {categoryLabels[log.category] || log.category}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{log.message}</span>
                  {log.durationMs && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{log.durationMs}ms</span>
                  )}
                  <span className="text-gray-400 dark:text-gray-500">{expandedLogId === log.id ? "▼" : "▶"}</span>
                </div>

                {expandedLogId === log.id && (
                  <div className="mt-3 ml-6 text-sm bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-500 dark:text-gray-400">Action:</span> <span className="font-mono text-gray-900 dark:text-white">{log.action}</span></div>
                      {log.requestId && <div><span className="text-gray-500 dark:text-gray-400">Request ID:</span> <span className="font-mono text-gray-900 dark:text-white">{log.requestId}</span></div>}
                      {log.clientId && <div><span className="text-gray-500 dark:text-gray-400">Client ID:</span> <span className="text-gray-900 dark:text-white">{log.clientId}</span></div>}
                      {log.userId && <div><span className="text-gray-500 dark:text-gray-400">User ID:</span> <span className="font-mono text-xs text-gray-900 dark:text-white">{log.userId}</span></div>}
                    </div>
                    {log.metadata && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Metadata:</div>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto text-gray-900 dark:text-white">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </div>
                    )}
                    {log.errorMessage && (
                      <div>
                        <div className="text-xs text-red-500 dark:text-red-400 mb-1">Error:</div>
                        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">{log.errorMessage}</div>
                      </div>
                    )}
                    {log.errorStack && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stack Trace:</div>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-48 text-gray-900 dark:text-white">{log.errorStack}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">ログがありません</div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ログ</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">システム動作ログの確認</p>
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {Object.entries(logTypeLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLogType(key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                logType === key ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Logs */}
        <div className="overflow-x-auto">
          {logType === "system_log" ? (
            renderSystemLogs()
          ) : (
            <>
              {renderCsvUploads()}
              {renderCsvConversions()}
              {renderProductImports()}
              {renderFileTransfers()}
              {renderAsanaNotifications()}
              {renderItemImports()}
              {!hasAnyLogs && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">ログがありません</div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
