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
  asanaEnabled: boolean
  monthlyExecutionDay: number | null
  createdAt: string
  updatedAt: string
  _count: { users: number }
}

interface EditFormData {
  clientCode: string
  clientName: string
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
  })
  const [saving, setSaving] = useState(false)

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

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-black">読み込み中...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 dark:text-red-400 bg-white dark:bg-black">エラー: {error}</div>

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">クライアント管理</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">クライアント一覧の確認と管理</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-white dark:bg-white text-black rounded text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-200 border border-gray-200 dark:border-gray-700"
          >
            + 新規追加
          </button>
        </div>

        {showForm && (
          <Card title="新規クライアント追加" className="mb-6">
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">クライアントコード</label>
                <input
                  type="text"
                  value={formData.clientCode}
                  onChange={e => setFormData(prev => ({ ...prev, clientCode: e.target.value }))}
                  placeholder="ABC"
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">クライアント名</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={e => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="クライアント名"
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                作成
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                キャンセル
              </button>
            </div>
          </Card>
        )}

        {/* Edit Modal */}
        {editingClient && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">クライアント編集</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">クライアントコード</label>
                  <input
                    type="text"
                    value={editFormData.clientCode}
                    onChange={e => setEditFormData(prev => ({ ...prev, clientCode: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">クライアント名</label>
                  <input
                    type="text"
                    value={editFormData.clientName}
                    onChange={e => setEditFormData(prev => ({ ...prev, clientName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  disabled={saving}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-white dark:bg-white text-black rounded text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
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
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">クライアント名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">ステータス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Asana</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">ユーザー</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">操作</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-3 px-4 text-sm font-mono font-medium text-gray-900 dark:text-white">{client.clientCode}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{client.clientName}</td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={client.status === "active" ? "success" : "warning"}>
                        {client.status === "active" ? "アクティブ" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={client.asanaEnabled ? "info" : "warning"}>
                        {client.asanaEnabled ? "有効" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700 dark:text-gray-300">{client._count.users}</td>
                    <td className="py-3 px-4 text-sm space-x-2">
                      <button
                        onClick={() => handleEdit(client)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">クライアントがいません</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Note:</span> Google Drive設定はシステム全体で共通です。「設定」メニューから設定してください。
          </div>
        </Card>
      </main>
    </div>
  )
}
