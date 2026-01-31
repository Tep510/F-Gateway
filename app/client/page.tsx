'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModernHeader from '@/app/components/ModernHeader'
import RoleGuard from '@/app/components/RoleGuard'
import Card from '@/app/components/Card'
import StatusBadge from '@/app/components/StatusBadge'
import { useClientDashboard } from '@/lib/hooks'

interface HistoryRow {
  date: string
  day: string
  shippingPlan: string | null
  receivingPlan: string | null
  shippingResult: string | null
  receivingResult: string | null
  productMaster: string | null
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function generateMonthHistory(year: number, month: number, productImportDates: Set<string>): HistoryRow[] {
  const history: HistoryRow[] = []
  const today = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  for (let day = daysInMonth; day >= 1; day--) {
    const date = new Date(year, month, day)
    if (date > today) continue

    const dateStr = date.toISOString().split('T')[0]
    const dayOfWeek = date.getDay()
    const dayName = DAY_NAMES[dayOfWeek]
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    history.push({
      date: dateStr,
      day: dayName,
      shippingPlan: isWeekend ? null : 'success',
      receivingPlan: isWeekend ? null : 'success',
      shippingResult: isWeekend ? null : 'success',
      receivingResult: isWeekend ? null : 'success',
      productMaster: productImportDates.has(dateStr) ? 'success' : null,
    })
  }

  return history
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '1日前'
  return `${diffDays}日前`
}

export default function ClientDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { data: dashboardData, isLoading } = useClientDashboard()
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // Redirect if unauthenticated
  if (status === 'unauthenticated') {
    router.replace('/')
    return null
  }

  // Show minimal loading only for initial session check
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="h-14 border-b border-gray-200 dark:border-gray-800" />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-gray-100 dark:bg-gray-900 rounded-lg" />
            <div className="h-24 bg-gray-100 dark:bg-gray-900 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = prev.month - 1
      if (newMonth < 0) {
        return { year: prev.year - 1, month: 11 }
      }
      return { year: prev.year, month: newMonth }
    })
  }

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = prev.month + 1
      if (newMonth > 11) {
        return { year: prev.year + 1, month: 0 }
      }
      return { year: prev.year, month: newMonth }
    })
  }

  const productImportDates = new Set<string>(
    dashboardData?.productImport?.importLogs
      ?.filter((log: { status: string }) => log.status === 'completed')
      ?.map((log: { date: string }) => log.date) || []
  )

  const history = generateMonthHistory(currentMonth.year, currentMonth.month, productImportDates)
  const monthLabel = `${currentMonth.year}年${currentMonth.month + 1}月`

  const lastImportAt = dashboardData?.productImport?.lastImportAt
  const lastImportDate = lastImportAt ? new Date(lastImportAt) : null

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        clientName={session.user.clientName}
        userEmail={session.user.email || ""}
        role={session.user.role}
      />
      <RoleGuard role="client" currentRole={session.user.role}>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Monthly Summary */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">今月の稼働日数</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {isLoading ? '-' : (dashboardData?.monthlySummary?.totalDays || 0)}日
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">成功</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                {isLoading ? '-' : (dashboardData?.monthlySummary?.successDays || 0)}日
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">エラー</div>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                {isLoading ? '-' : (dashboardData?.monthlySummary?.errorDays || 0)}日
              </div>
            </div>
          </div>
        </Card>

        {/* Item Master Status */}
        <Card title="商品マスタ更新状況" className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">最終更新</div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <span className="text-lg text-gray-400 dark:text-gray-500">読み込み中...</span>
                ) : lastImportDate ? (
                  <>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      {lastImportDate.toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <StatusBadge status="success">{formatRelativeTime(lastImportAt!)}</StatusBadge>
                  </>
                ) : (
                  <span className="text-lg text-gray-400 dark:text-gray-500">未アップロード</span>
                )}
              </div>
            </div>
            <a
              href="/client/items"
              className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white"
            >
              商品マスタを表示 →
            </a>
          </div>
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-300">
            <strong>推奨:</strong> 商品マスタは可能な限り毎日更新してください。在庫情報の精度向上につながります。
          </div>
        </Card>

        {/* Work History */}
        <Card title={`${monthLabel} 作業履歴`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">日付</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">曜日</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">出庫予定</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">入庫予定</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">出庫実績</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">入庫実績</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">商品マスタ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      row.day === '土' || row.day === '日' ? 'bg-gray-50 dark:bg-gray-900' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{row.date}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{row.day}</td>
                    <td className="py-3 px-4 text-sm">
                      {row.shippingPlan === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.shippingPlan === 'error' && <StatusBadge status="error">エラー</StatusBadge>}
                      {row.shippingPlan === null && <span className="text-gray-400 dark:text-gray-500">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.receivingPlan === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.receivingPlan === null && <span className="text-gray-400 dark:text-gray-500">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.shippingResult === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.shippingResult === null && <span className="text-gray-400 dark:text-gray-500">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.receivingResult === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.receivingResult === null && <span className="text-gray-400 dark:text-gray-500">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.productMaster === 'success' ? (
                        <StatusBadge status="success">OK</StatusBadge>
                      ) : row.day !== '土' && row.day !== '日' ? (
                        <StatusBadge status="warning">未</StatusBadge>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-center gap-4">
            <button
              onClick={goToPreviousMonth}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              ← 前月
            </button>
            <button
              onClick={goToNextMonth}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              次月 →
            </button>
          </div>
        </Card>

      </main>
      </RoleGuard>
    </div>
  )
}
