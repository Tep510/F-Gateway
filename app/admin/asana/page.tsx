"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"

export default function AdminAsana() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("この画面には「管理者」ロールが必要です。")
      router.replace("/client")
    }
  }, [status, session, router])

  if (status === "loading") return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-black">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Asana</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Asana連携の設定</p>
        </div>

        <Card title="Asana 設定">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">各クライアントのAsana設定はクライアント管理ページで行います。</p>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-300">
              <strong>運用方針:</strong> Asanaは各クライアントの作業進捗通知先として使用します。
            </div>
            <div className="mt-4">
              <button
                onClick={() => router.push('/admin/clients')}
                className="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-gray-100"
              >
                クライアント管理へ
              </button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
