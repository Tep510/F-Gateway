import ModernHeader from '@/app/components/ModernHeader';
import RoleGuard from '@/app/components/RoleGuard';
import Card from '@/app/components/Card';
import StatusBadge from '@/app/components/StatusBadge';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ClientDashboard() {
  const session = await auth();

  if (!session?.user) {
    redirect('/');
  }

  // モックデータ
  const mockHistory = [
    {
      date: '2026-01-28',
      day: '火',
      shippingPlan: 'success',
      receivingPlan: 'success',
      shippingResult: 'success',
      receivingResult: 'success',
    },
    {
      date: '2026-01-27',
      day: '月',
      shippingPlan: 'success',
      receivingPlan: 'success',
      shippingResult: 'success',
      receivingResult: 'success',
    },
    {
      date: '2026-01-26',
      day: '日',
      shippingPlan: 'success',
      receivingPlan: null,
      shippingResult: 'success',
      receivingResult: null,
    },
    {
      date: '2026-01-25',
      day: '土',
      shippingPlan: 'success',
      receivingPlan: null,
      shippingResult: 'success',
      receivingResult: null,
    },
    {
      date: '2026-01-24',
      day: '金',
      shippingPlan: 'error',
      receivingPlan: 'success',
      shippingResult: null,
      receivingResult: 'success',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        userEmail={session.user.email || ""}
        role={session.user.role}
      />
      <RoleGuard role="client" currentRole={session.user.role}>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-gray-600 mt-1">T-shirts.sc</p>
        </div>

        {/* Monthly Summary */}
        <Card title="月次サマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600">今月の稼働日数</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">28日</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">成功</div>
              <div className="text-3xl font-bold text-green-600 mt-1">27日</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">エラー</div>
              <div className="text-3xl font-bold text-red-600 mt-1">1日</div>
            </div>
          </div>
        </Card>

        {/* Item Master Status */}
        <Card title="商品マスタ更新状況" className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 mb-1">最終更新</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">2026-01-27 14:30</span>
                <StatusBadge status="success">1日前</StatusBadge>
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
        <Card title="2026年1月 作業履歴">
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
                </tr>
              </thead>
              <tbody>
                {mockHistory.map((row, idx) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-center gap-4">
            <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm">
              ← 前月
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm">
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
  );
}
