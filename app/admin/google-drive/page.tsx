"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"

interface FolderInfo {
  id: string | null
  name: string
  created?: boolean
}

interface DriveState {
  hasCredentials: boolean
  initialized: boolean
  sharedDriveId: string
  folders: {
    shippingPlan: FolderInfo
    shippingResult: FolderInfo
    receivingPlan: FolderInfo
    receivingResult: FolderInfo
  } | null
}

export default function AdminGoogleDrive() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [driveState, setDriveState] = useState<DriveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(false)
  const [sharedDriveInput, setSharedDriveInput] = useState("")
  const [initResult, setInitResult] = useState<{ success: boolean; message: string; folders?: Record<string, FolderInfo> } | null>(null)
  const [copiedEmail, setCopiedEmail] = useState(false)

  const serviceAccountEmail = "f-gateway-drive@f-gateway.iam.gserviceaccount.com"

  const copyServiceAccountEmail = async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail)
      setCopiedEmail(true)
      setTimeout(() => setCopiedEmail(false), 2000)
    } catch {
      alert("Failed to copy")
    }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.role !== "admin") {
      alert("Requires admin role")
      router.replace("/client")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === "authenticated") {
      loadSettings()
    }
  }, [status])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/settings/google-drive")
      if (res.ok) {
        const data = await res.json()
        setDriveState(data)
        setSharedDriveInput(data.sharedDriveId || "")
      }
    } catch {
      console.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleInitialize = async () => {
    if (!sharedDriveInput.trim()) {
      alert("共有ドライブのURLまたはIDを入力してください")
      return
    }

    setInitializing(true)
    setInitResult(null)

    try {
      const res = await fetch("/api/admin/settings/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedDriveId: sharedDriveInput }),
      })

      const data = await res.json()

      if (data.success) {
        setInitResult({
          success: true,
          message: data.message,
          folders: data.folders,
        })
        loadSettings()
      } else {
        setInitResult({
          success: false,
          message: data.error || "初期化に失敗しました",
        })
      }
    } catch {
      setInitResult({
        success: false,
        message: "初期化中にエラーが発生しました",
      })
    } finally {
      setInitializing(false)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="h-14 border-b border-gray-200 dark:border-gray-800" />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-100 dark:bg-gray-900 rounded w-48" />
            <div className="h-64 bg-gray-100 dark:bg-gray-900 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Google Drive</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">共有ドライブの設定</p>
        </div>

        {/* Status Card */}
        <Card title="接続状況" className="mb-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={driveState?.hasCredentials ? "success" : "error"}>
                {driveState?.hasCredentials ? "認証情報: OK" : "認証情報: 未設定"}
              </StatusBadge>
              <StatusBadge status={driveState?.initialized ? "success" : "warning"}>
                {driveState?.initialized ? "初期化: 完了" : "初期化: 未実行"}
              </StatusBadge>
            </div>

            {!driveState?.hasCredentials && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                環境変数 GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON が設定されていません。Vercelの環境変数を確認してください。
              </div>
            )}
          </div>
        </Card>

        {/* Setup Card */}
        <Card title="共有ドライブ設定" className="mb-6">
          <div className="space-y-6">
            {/* Service Account Info */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-2">
                事前準備: サービスアカウントを共有ドライブのメンバーに追加
              </p>
              <ol className="text-sm text-blue-700 dark:text-blue-400 list-decimal list-inside space-y-1 mb-3">
                <li>Google Driveで共有ドライブを開く</li>
                <li>共有ドライブ名をクリック → 「メンバーを管理」</li>
                <li>下記のメールアドレスを「コンテンツ管理者」として追加</li>
              </ol>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded px-3 py-2 border border-blue-100 dark:border-gray-700">
                <code className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{serviceAccountEmail}</code>
                <button
                  type="button"
                  onClick={copyServiceAccountEmail}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium flex-shrink-0"
                >
                  {copiedEmail ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Shared Drive Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                共有ドライブ
              </label>
              <input
                type="text"
                value={sharedDriveInput}
                onChange={e => setSharedDriveInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/0AB... または共有ドライブID"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                disabled={initializing}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                共有ドライブのURLをそのまま貼り付けるか、IDを入力してください
              </p>
            </div>

            {/* Initialize Button */}
            <button
              onClick={handleInitialize}
              disabled={initializing || !driveState?.hasCredentials}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {initializing ? "初期化中..." : driveState?.initialized ? "再初期化" : "初期化を実行"}
            </button>

            {/* Result */}
            {initResult && (
              <div className={`p-4 rounded-lg ${initResult.success ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
                <div className={`text-sm font-medium ${initResult.success ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>
                  {initResult.success ? "初期化成功" : "初期化エラー"}
                </div>
                <div className={`text-sm mt-1 ${initResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {initResult.message}
                </div>
                {initResult.folders && (
                  <div className="mt-3 space-y-1">
                    {Object.entries(initResult.folders).map(([key, folder]) => (
                      <div key={key} className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                        <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white">
                          {folder.created ? "+" : "✓"}
                        </span>
                        <span>{folder.name}: {folder.created ? "新規作成" : "既存"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Current Folders Card */}
        {driveState?.initialized && driveState.folders && (
          <Card title="作成済みフォルダ">
            <div className="space-y-3">
              {Object.entries(driveState.folders).map(([key, folder]) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{folder.name}</span>
                  </div>
                  <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">{folder.id}</code>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Flow Card */}
        <Card title="CSVファイルの流れ" className="mt-6">
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-medium">1</span>
              <div>
                <span className="font-medium">クライアントがCSVアップロード</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">各クライアントがF-Gateway経由で出庫/入庫予定CSVをアップロード</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-medium">2</span>
              <div>
                <span className="font-medium">F-Gatewayでリネーム</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">クライアントコード・日時を付与してファイル名を標準化</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-medium">3</span>
              <div>
                <span className="font-medium">共有ドライブのフォルダに自動格納</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">出庫予定 → 「出庫予定」フォルダ、入庫予定 → 「入庫予定」フォルダ</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-medium">4</span>
              <div>
                <span className="font-medium">Friendslogiが処理・実績返却</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">出庫/入庫実績CSVが実績フォルダに格納される</p>
              </div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
