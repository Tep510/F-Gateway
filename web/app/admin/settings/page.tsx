"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"

export default function AdminSettings() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("general")

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("この画面には「管理者」ロールが必要です。")
      router.replace("/client")
    }
  }, [status, session, router])

  if (status === "loading") return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>

  const tabs = [
    { key: "general", label: "一般設定" },
    { key: "google", label: "Google Drive" },
    { key: "asana", label: "Asana" },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">設定</h1>
          <p className="text-gray-600 mt-1">システム設定の確認と変更</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key ? "border-blue-600 text-gray-900" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "general" && (
          <Card title="一般設定">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">システム名</label>
                <input type="text" defaultValue="F-Gateway" className="px-3 py-2 border border-gray-300 rounded text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-500" readOnly />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">バージョン</label>
                <input type="text" defaultValue="0.1.0" className="px-3 py-2 border border-gray-300 rounded text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-500" readOnly />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">環境</label>
                <input type="text" defaultValue="Production" className="px-3 py-2 border border-gray-300 rounded text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-500" readOnly />
              </div>
            </div>
          </Card>
        )}

        {activeTab === "google" && (
          <Card title="Google Drive 設定">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">各クライアントのGoogle Drive設定はクライアント管理ページで行います。</p>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <strong>運用方針:</strong> Google Driveは各クライアントごとに個別のフォルダを割り当て、CSVの入出力窓口とする。
              </div>
            </div>
          </Card>
        )}

        {activeTab === "asana" && (
          <Card title="Asana 設定">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">各クライアントのAsana設定はクライアント管理ページで行います。</p>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <strong>運用方針:</strong> Asanaは各クライアントの作業進捗通知先として使用する。
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
