"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ModernHeader from "@/app/components/ModernHeader"
import Card from "@/app/components/Card"
import StatusBadge from "@/app/components/StatusBadge"

interface DriveSettings {
  shippingPlanFolderId: string
  shippingResultFolderId: string
  receivingPlanFolderId: string
  receivingResultFolderId: string
}

export default function AdminGoogleDrive() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Google Drive settings
  const [driveSettings, setDriveSettings] = useState<DriveSettings>({
    shippingPlanFolderId: "",
    shippingResultFolderId: "",
    receivingPlanFolderId: "",
    receivingResultFolderId: "",
  })
  const [driveLoading, setDriveLoading] = useState(true)
  const [driveSaving, setDriveSaving] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)

  const serviceAccountEmail = "script@friendslogi.com"

  const extractFolderId = (input: string): string => {
    if (!input) return ""
    const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (folderMatch) return folderMatch[1]
    const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (idMatch) return idMatch[1]
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
    if (status === "authenticated") {
      loadDriveSettings()
    }
  }, [status])

  const loadDriveSettings = async () => {
    setDriveLoading(true)
    try {
      const res = await fetch("/api/admin/settings/google-drive")
      if (res.ok) {
        const data = await res.json()
        setDriveSettings(data.settings)
      }
    } catch {
      console.error("Failed to load drive settings")
    } finally {
      setDriveLoading(false)
    }
  }

  const saveDriveSettings = async () => {
    setDriveSaving(true)
    try {
      const res = await fetch("/api/admin/settings/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingPlanFolderId: extractFolderId(driveSettings.shippingPlanFolderId),
          shippingResultFolderId: extractFolderId(driveSettings.shippingResultFolderId),
          receivingPlanFolderId: extractFolderId(driveSettings.receivingPlanFolderId),
          receivingResultFolderId: extractFolderId(driveSettings.receivingResultFolderId),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setDriveSettings(data.settings)
        alert("Google Drive設定を保存しました")
      } else {
        alert("保存に失敗しました")
      }
    } catch {
      alert("保存中にエラーが発生しました")
    } finally {
      setDriveSaving(false)
    }
  }

  const isConfigured = (folderId: string) => !!folderId && folderId.length > 0

  if (status === "loading") return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-black">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session?.user?.email || ""} role={session?.user?.role} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Google Drive</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">共有フォルダの設定</p>
        </div>

        <div className="space-y-6">
          <Card title="Google Drive 設定">
            {driveLoading ? (
              <div className="text-gray-500 dark:text-gray-400">読み込み中...</div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-2">システム全体で共有する4つのフォルダ</p>
                      <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
                        全クライアントがCSVをアップロードすると、F-Gatewayがファイルをリネームしてこれらのフォルダに格納します。
                        <strong>下記アカウントがアクセス可能なFriendslogi社のGoogle Driveフォルダを設定してください。</strong>
                      </p>
                      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded px-3 py-2 border border-blue-100 dark:border-gray-700">
                        <code className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{serviceAccountEmail}</code>
                        <button
                          type="button"
                          onClick={copyServiceAccountEmail}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium flex-shrink-0"
                        >
                          {copiedEmail ? "コピー完了" : "コピー"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={isConfigured(driveSettings.shippingPlanFolderId) ? "success" : "warning"}>
                      出庫予定
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={isConfigured(driveSettings.shippingResultFolderId) ? "success" : "warning"}>
                      出庫実績
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={isConfigured(driveSettings.receivingPlanFolderId) ? "success" : "warning"}>
                      入庫予定
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={isConfigured(driveSettings.receivingResultFolderId) ? "success" : "warning"}>
                      入庫実績
                    </StatusBadge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      出庫予定フォルダ
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">クライアントの出庫予定CSVを格納</span>
                    </label>
                    <input
                      type="text"
                      value={driveSettings.shippingPlanFolderId}
                      onChange={e => setDriveSettings(prev => ({ ...prev, shippingPlanFolderId: e.target.value }))}
                      placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      出庫実績フォルダ
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">出庫実績CSVを格納（Friendslogiからの返却先）</span>
                    </label>
                    <input
                      type="text"
                      value={driveSettings.shippingResultFolderId}
                      onChange={e => setDriveSettings(prev => ({ ...prev, shippingResultFolderId: e.target.value }))}
                      placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      入庫予定フォルダ
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">クライアントの入庫予定CSVを格納</span>
                    </label>
                    <input
                      type="text"
                      value={driveSettings.receivingPlanFolderId}
                      onChange={e => setDriveSettings(prev => ({ ...prev, receivingPlanFolderId: e.target.value }))}
                      placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      入庫実績フォルダ
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">入庫実績CSVを格納（Friendslogiからの返却先）</span>
                    </label>
                    <input
                      type="text"
                      value={driveSettings.receivingResultFolderId}
                      onChange={e => setDriveSettings(prev => ({ ...prev, receivingResultFolderId: e.target.value }))}
                      placeholder="https://drive.google.com/drive/folders/... またはフォルダID"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={saveDriveSettings}
                    disabled={driveSaving}
                    className="px-6 py-2 bg-white text-black rounded text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
                  >
                    {driveSaving ? "保存中..." : "設定を保存"}
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card title="CSVファイルの流れ">
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
                  <span className="font-medium">共有フォルダに格納</span>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">上記4つのフォルダに種類別にCSVを格納</p>
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
        </div>
      </main>
    </div>
  )
}
