"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"

interface User {
  id: number
  email: string
  name: string | null
  role: string
  clientId: number | null
  status: string
  createdAt: string
}

export default function AdminUsers() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ email: "", name: "", role: "client" })

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("この画面には「管理者」ロールが必要です。")
      router.replace("/client")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/admin/users")
      .then(res => res.json())
      .then(data => { setUsers(data.users || []); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [status])

  const handleCreate = async () => {
    if (!formData.email) return
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
    if (res.ok) {
      const data = await res.json()
      setUsers(prev => [...prev, data.user])
      setFormData({ email: "", name: "", role: "client" })
      setShowForm(false)
    } else {
      const data = await res.json()
      alert(data.error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("このユーザーを削除しますか？")) return
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id))
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
            <h1 className="text-2xl font-bold text-gray-900">ユーザー管理</h1>
            <p className="text-gray-600 mt-1">ユーザー一覧の確認と管理</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            + 新規追加
          </button>
        </div>

        {showForm && (
          <Card title="新規ユーザー追加" className="mb-6">
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-sm text-gray-600 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="px-3 py-2 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">名前</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="名前"
                  className="px-3 py-2 border border-gray-300 rounded text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">ロール</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="client">クライアント</option>
                  <option value="admin">管理者</option>
                </select>
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

        <Card title={`ユーザー一覧 (${users.length}件)`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">メールアドレス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">名前</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ロール</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ステータス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">作成日</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{user.email}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{user.name || "-"}</td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={user.role === "admin" ? "info" : "success"}>
                        {user.role === "admin" ? "管理者" : "クライアント"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={user.status === "active" ? "success" : "warning"}>
                        {user.status === "active" ? "アクティブ" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString("ja-JP")}</td>
                    <td className="py-3 px-4 text-sm">
                      <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800 text-sm">削除</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-sm">ユーザーがいません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  )
}
