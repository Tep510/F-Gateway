"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"

interface Client {
  id: number
  clientCode: string
  clientName: string
  status: string
  shippingPlanDriveId: string | null
  shippingResultDriveId: string | null
  receivingPlanDriveId: string | null
  receivingResultDriveId: string | null
  asanaEnabled: boolean
  monthlyExecutionDay: number | null
  createdAt: string
  updatedAt: string
  _count: { users: number }
}

interface EditFormData {
  clientCode: string
  clientName: string
  shippingPlanDriveId: string
  shippingResultDriveId: string
  receivingPlanDriveId: string
  receivingResultDriveId: string
}

export default function AdminClients() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ clientCode: "", clientName: "" })
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editFormData, setEditFormData] = useState<EditFormData>({
    clientCode: "",
    clientName: "",
    shippingPlanDriveId: "",
    shippingResultDriveId: "",
    receivingPlanDriveId: "",
    receivingResultDriveId: "",
  })
  const [saving, setSaving] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)

  // サービスアカウントメールアドレス（環境変数から取得、なければダミー）
  const serviceAccountEmail = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_EMAIL || "f-gateway@your-project.iam.gserviceaccount.com"

  // Google DriveのURLからフォルダIDを抽出
  const extractFolderId = (input: string): string => {
    if (!input) return ""
    // URLパターン: /folders/xxxxx
    const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (folderMatch) return folderMatch[1]
    // URLパターン: ?id=xxxxx
    const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (idMatch) return idMatch[1]
    // フォルダIDのみ入力された場合
    if (/^[a-zA-Z0-9_-]+$/.test(input)) return input
    return input
  }

  const copyServiceAccountEmail = async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail)
      setCopiedEmail(true)
      setTimeout(() => setCopiedEmail(false), 2000)
    } catch {
      alert("コピーに失敗しました")
    }
  }

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
      .then(data => { setClients(data.clients || []); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [status])

  const handleCreate = async () => {
    if (!formData.clientCode || !formData.clientName) return
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
    if (res.ok) {
      const data = await res.json()
      setClients(prev => [...prev, data.client])
      setFormData({ clientCode: "", clientName: "" })
      setShowForm(false)
    } else {
      const data = await res.json()
      alert(data.error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("このクライアントを削除しますか？")) return
    const res = await fetch(`/api/admin/clients/${id}`, { method: "DELETE" })
    if (res.ok) {
      setClients(prev => prev.filter(c => c.id !== id))
    }
  }

  const handleEdit = (client: Client) => {
    setEditingClient(client)
    setEditFormData({
      clientCode: client.clientCode,
      clientName: client.clientName,
      shippingPlanDriveId: client.shippingPlanDriveId || "",
      shippingResultDriveId: client.shippingResultDriveId || "",
      receivingPlanDriveId: client.receivingPlanDriveId || "",
      receivingResultDriveId: client.receivingResultDriveId || "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingClient) return
    setSaving(true)

    try {
      const res = await fetch(`/api/admin/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientCode: editFormData.clientCode,
          clientName: editFormData.clientName,
          shippingPlanDriveId: extractFolderId(editFormData.shippingPlanDriveId) || null,
          shippingResultDriveId: extractFolderId(editFormData.shippingResultDriveId) || null,
          receivingPlanDriveId: extractFolderId(editFormData.receivingPlanDriveId) || null,
          receivingResultDriveId: extractFolderId(editFormData.receivingResultDriveId) || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setClients(prev =>
          prev.map(c => (c.id === editingClient.id ? { ...c, ...data.client } : c))
        )
        setEditingClient(null)
      } else {
        const data = await res.json()
        alert(data.error || "更新に失敗しました")
      }
    } catch {
      alert("更新中にエラーが発生しました")
    } finally {
      setSaving(false)
    }
  }

  const DriveCheckmark = ({ configured }: { configured: boolean }) => (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${configured ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
      {configured ? (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      )}
    </span>
  )

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600">エラー: {error}</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">クライアント管理</h1>
            <p className="text-gray-600 mt-1">クライアント一覧の確認と管理</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            + 新規追加
          </button>
        </div>

        {showForm && (
          <Card title="新規クライアント追加" className="mb-6">
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-sm text-gray-600 mb-1">クライアントコード</label>
                <input
                  type="text"
                  value={formData.clientCode}
                  onChange={e => setFormData(prev => ({ ...prev, clientCode: e.target.value }))}
                  placeholder="ABC"
                  className="px-3 py-2 border border-gray-300 rounded text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">クライアント名</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={e => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="クライアント名"
                  className="px-3 py-2 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
              >
                作成
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </Card>
        )}

        {/* Edit Modal */}
        {editingClient && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">クライアント編集</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">クライアントコード</label>
                    <input
                      type="text"
                      value={editFormData.clientCode}
                      onChange={e => setEditFormData(prev => ({ ...prev, clientCode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">クライアント名</label>
                    <input
                      type="text"
                      value={editFormData.clientName}
                      onChange={e => setEditFormData(prev => ({ ...prev, clientName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Google Drive設定</h4>

                  {/* サービスアカウント情報 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm text-blue-800 font-medium mb-1">フォルダ共有が必要です</p>
                        <p className="text-xs text-blue-700 mb-2">
                          下記のサービスアカウントをGoogle Driveフォルダに「編集者」として共有してください。
                        </p>
                        <div className="flex items-center gap-2 bg-white rounded px-2 py-1.5">
                          <code className="text-xs text-gray-700 flex-1 truncate">{serviceAccountEmail}</code>
                          <button
                            type="button"
                            onClick={copyServiceAccountEmail}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium flex-shrink-0"
                          >
                            {copiedEmail ? "コピー完了" : "コピー"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">出庫予定フォルダ（クライアント提出先）</label>
                      <input
                        type="text"
                        value={editFormData.shippingPlanDriveId}
                        onChange={e => setEditFormData(prev => ({ ...prev, shippingPlanDriveId: e.target.value }))}
                        placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">出庫実績フォルダ（実績返却先）</label>
                      <input
                        type="text"
                        value={editFormData.shippingResultDriveId}
                        onChange={e => setEditFormData(prev => ({ ...prev, shippingResultDriveId: e.target.value }))}
                        placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">入庫予定フォルダ（クライアント提出先）</label>
                      <input
                        type="text"
                        value={editFormData.receivingPlanDriveId}
                        onChange={e => setEditFormData(prev => ({ ...prev, receivingPlanDriveId: e.target.value }))}
                        placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">入庫実績フォルダ（実績返却先）</label>
                      <input
                        type="text"
                        value={editFormData.receivingResultDriveId}
                        onChange={e => setEditFormData(prev => ({ ...prev, receivingResultDriveId: e.target.value }))}
                        placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  disabled={saving}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        <Card title={`クライアント一覧 (${clients.length}件)`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">クライアント名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ステータス</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-700" title="出庫予定">出予</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-700" title="出庫実績">出実</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-700" title="入庫予定">入予</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-700" title="入庫実績">入実</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Asana</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">ユーザー</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-mono font-medium text-gray-900">{client.clientCode}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{client.clientName}</td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={client.status === "active" ? "success" : "warning"}>
                        {client.status === "active" ? "アクティブ" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <DriveCheckmark configured={!!client.shippingPlanDriveId} />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <DriveCheckmark configured={!!client.shippingResultDriveId} />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <DriveCheckmark configured={!!client.receivingPlanDriveId} />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <DriveCheckmark configured={!!client.receivingResultDriveId} />
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={client.asanaEnabled ? "info" : "warning"}>
                        {client.asanaEnabled ? "有効" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700">{client._count.users}</td>
                    <td className="py-3 px-4 text-sm space-x-2">
                      <button
                        onClick={() => handleEdit(client)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-sm">クライアントがいません</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            <span className="font-medium">Google Drive設定:</span> 出予=出庫予定, 出実=出庫実績, 入予=入庫予定, 入実=入庫実績
          </div>
        </Card>
      </main>
    </div>
  )
}
