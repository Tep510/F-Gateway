'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModernHeader from '@/app/components/ModernHeader'
import RoleGuard from '@/app/components/RoleGuard'
import Card from '@/app/components/Card'
import StatusBadge from '@/app/components/StatusBadge'

interface DashboardData {
  client: {
    id: number
    clientCode: string
    clientName: string
    status: string
  }
  monthlySummary: {
    totalDays: number
    successDays: number
    errorDays: number
  }
  productImport: {
    lastImportAt: string | null
    importLogs: { date: string; status: string }[]
  }
}

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
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/')
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchDashboard()
    }
  }, [status])

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/client/dashboard')
      if (res.ok) {
        const data = await res.json()
        setDashboardData(data)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error)
    } finally {
      setLoading(false)
    }
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

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>
  }

  if (!session?.user) {
    return null
  }

  const productImportDates = new Set(
    dashboardData?.productImport?.importLogs
      ?.filter(log => log.status === 'completed')
      ?.map(log => log.date) || []
  )

  const history = generateMonthHistory(currentMonth.year, currentMonth.month, productImportDates)
  const monthLabel = `${currentMonth.year}年${currentMonth.month + 1}月`

  const lastImportAt = dashboardData?.productImport?.lastImportAt
  const lastImportDate = lastImportAt ? new Date(lastImportAt) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        userEmail={session.user.email || ""}
        role={session.user.role}
      />
      <RoleGuard role="client" currentRole={session.user.role}>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Monthly Summary */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600">今月の稼働日数</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">
                {dashboardData?.monthlySummary?.totalDays || 0}日
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">成功</div>
              <div className="text-3xl font-bold text-green-600 mt-1">
                {dashboardData?.monthlySummary?.successDays || 0}日
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">エラー</div>
              <div className="text-3xl font-bold text-red-600 mt-1">
                {dashboardData?.monthlySummary?.errorDays || 0}日
              </div>
            </div>
          </div>
        </Card>

        {/* Item Master Status */}
        <Card title="商品マスタ更新状況" className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 mb-1">最終更新</div>
              <div className="flex items-center gap-2">
                {lastImportDate ? (
                  <>
                    <span className="text-lg font-semibold">
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
                  <span className="text-lg text-gray-400">未アップロード</span>
                )}
              </div>
            </div>
            <a
              href="/client/items"
              className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium"
            >
              商品マスタを表示 →
            </a>
          </div>
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            <strong>推奨:</strong> 商品マスタは可能な限り毎日更新してください。在庫情報の精度向上につながります。
          </div>
        </Card>

        {/* Work History */}
        <Card title={`${monthLabel} 作業履歴`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">日付</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">曜日</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">出庫予定</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">入庫予定</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">出庫実績</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">入庫実績</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">商品マスタ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      row.day === '土' || row.day === '日' ? 'bg-gray-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-900">{row.date}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{row.day}</td>
                    <td className="py-3 px-4 text-sm">
                      {row.shippingPlan === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.shippingPlan === 'error' && <StatusBadge status="error">エラー</StatusBadge>}
                      {row.shippingPlan === null && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.receivingPlan === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.receivingPlan === null && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.shippingResult === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.shippingResult === null && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.receivingResult === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.receivingResult === null && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.productMaster === 'success' ? (
                        <StatusBadge status="success">OK</StatusBadge>
                      ) : row.day !== '土' && row.day !== '日' ? (
                        <StatusBadge status="warning">未</StatusBadge>
                      ) : (
                        <span className="text-gray-400">-</span>
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
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              ← 前月
            </button>
            <button
              onClick={goToNextMonth}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              次月 →
            </button>
          </div>
        </Card>

        <div className="mt-6">
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 19h10l10-17z" />
            </svg>
            Google Driveを開く
          </a>
        </div>
      </main>
      </RoleGuard>
    </div>
  )
}
