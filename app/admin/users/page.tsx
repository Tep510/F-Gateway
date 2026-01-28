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
}

interface User {
  id: string
  email: string
  name: string | null
  role: string
  clientId: number | null
  status: string
  createdAt: string
  client?: {
    clientCode: string
    clientName: string
  } | null
}

interface FormData {
  email: string
  name: string
  role: string
  clientId: string
}

export default function AdminUsers() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<FormData>({ email: "", name: "", role: "client", clientId: "" })

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("この画面には「管理者」ロールが必要です。")
      router.replace("/client")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status !== "authenticated") return

    // Fetch users and clients in parallel
    Promise.all([
      fetch("/api/admin/users").then(res => res.json()),
      fetch("/api/admin/clients").then(res => res.json())
    ])
      .then(([usersData, clientsData]) => {
        setUsers(usersData.users || [])
        setClients(clientsData.clients || [])
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [status])

  const resetForm = () => {
    setFormData({ email: "", name: "", role: "client", clientId: "" })
    setEditingUser(null)
    setShowForm(false)
  }

  const openEditForm = (user: User) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      name: user.name || "",
      role: user.role,
      clientId: user.clientId?.toString() || ""
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!formData.email) return

    const payload = {
      email: formData.email,
      name: formData.name || null,
      role: formData.role,
      clientId: formData.clientId ? parseInt(formData.clientId) : null
    }

    if (editingUser) {
      // Update existing user
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...data.user, client: clients.find(c => c.id === payload.clientId) || null } : u))
        resetForm()
      } else {
        const data = await res.json()
        alert(data.error)
      }
    } else {
      // Create new user
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        const newUser = { ...data.user, client: clients.find(c => c.id === payload.clientId) || null }
        setUsers(prev => [newUser, ...prev])
        resetForm()
      } else {
        const data = await res.json()
        alert(data.error)
      }
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("このユーザーを削除しますか？")) return
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'inactive' } : u))
    }
  }

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-black">読み込み中...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 dark:text-red-400 bg-white dark:bg-black">エラー: {error}</div>

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ユーザー管理</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">ユーザー一覧の確認と管理</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            + 新規追加
          </button>
        </div>

        {showForm && (
          <Card title={editingUser ? "ユーザー編集" : "新規ユーザー追加"} className="mb-6">
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  disabled={!!editingUser}
                  className={`px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white ${editingUser ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">名前</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="名前"
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">ロール</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="client">クライアント</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">紐付けクライアント</label>
                <select
                  value={formData.clientId}
                  onChange={e => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="">未設定</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.clientCode} - {client.clientName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
              >
                {editingUser ? "更新" : "作成"}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
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
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">メールアドレス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">名前</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">ロール</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">紐付けクライアント</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">ステータス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">作成日</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{user.email}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{user.name || "-"}</td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={user.role === "admin" ? "info" : "success"}>
                        {user.role === "admin" ? "管理者" : "クライアント"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {user.client ? (
                        <span className="text-gray-900 dark:text-white">{user.client.clientCode} - {user.client.clientName}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">未設定</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={user.status === "active" ? "success" : "warning"}>
                        {user.status === "active" ? "アクティブ" : "無効"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{new Date(user.createdAt).toLocaleDateString("ja-JP")}</td>
                    <td className="py-3 px-4 text-sm space-x-2">
                      <button onClick={() => openEditForm(user)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm">編集</button>
                      <button onClick={() => handleDelete(user.id)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm">削除</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">ユーザーがいません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  )
}
