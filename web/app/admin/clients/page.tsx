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
  _count: { users: number; csvUploadLogs: number }
}

export default function AdminClients() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ clientCode: "", clientName: "" })

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

        <Card title={`クライアント一覧 (${clients.length}件)`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">クライアント名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ステータス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Asana</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">ユーザー数</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">アップロード数</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">作成日</th>
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
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={client.asanaEnabled ? "info" : "warning"}>
                        {client.asanaEnabled ? "有効" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700">{client._count.users}</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700">{client._count.csvUploadLogs}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{new Date(client.createdAt).toLocaleDateString("ja-JP")}</td>
                    <td className="py-3 px-4 text-sm">
                      <button onClick={() => handleDelete(client.id)} className="text-red-600 hover:text-red-800 text-sm">削除</button>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-sm">クライアントがいません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  )
}
