import ModernHeader from '@/app/components/ModernHeader';
import RoleGuard from '@/app/components/RoleGuard';
import Card from '@/app/components/Card';
import StatusBadge from '@/app/components/StatusBadge';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AdminDashboard() {
  const session = await auth();

  if (!session?.user) {
    redirect('/');
  }

  // モックデータ
  const recentActivity = [
    {
      date: '2026-01-28',
      time: '14:32',
      client: 'DAQ',
      type: 'アップロード',
      status: 'success',
    },
    {
      date: '2026-01-28',
      time: '14:25',
      client: 'MNG',
      type: 'アップロード',
      status: 'success',
    },
    {
      date: '2026-01-28',
      time: '10:15',
      client: 'DAQ',
      type: '出庫実績',
      status: 'success',
    },
    {
      date: '2026-01-28',
      time: '09:45',
      client: 'OSN',
      type: 'アップロード',
      status: 'success',
    },
    {
      date: '2026-01-28',
      time: '09:30',
      client: 'MNG',
      type: '出庫実績',
      status: 'success',
    },
  ];

  const todayClients = [
    { code: 'DAQ', name: 'T-shirts.sc', upload: 'success', shipment: 'success', lastActivity: '14:32' },
    { code: 'MNG', name: 'Morinogakkou', upload: 'success', shipment: 'success', lastActivity: '14:25' },
    { code: 'OSN', name: 'Oson Stock', upload: 'success', shipment: null, lastActivity: '09:45' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader scope="Admin" userEmail={session.user.email || ""} role={session.user.role} />
      <RoleGuard role="admin" currentRole={session.user.role}>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-gray-600 mt-1">システム概況</p>
        </div>

        {/* System Status */}
        <Card title="システムステータス" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600">稼働クライアント</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">3</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">本日のアップロード</div>
              <div className="text-3xl font-bold text-blue-600 mt-1">3</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">本日の出庫実績</div>
              <div className="text-3xl font-bold text-green-600 mt-1">2</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">本日のエラー</div>
              <div className="text-3xl font-bold text-red-600 mt-1">0</div>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card title="最新のアクティビティ" className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">日付</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">時刻</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">クライアント</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">種別</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{row.date}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{row.time}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{row.client}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{row.type}</td>
                    <td className="py-3 px-4 text-sm">
                      {row.status === 'success' && <StatusBadge status="success">完了</StatusBadge>}
                      {row.status === 'error' && <StatusBadge status="error">エラー</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Today Client Status */}
        <Card title="本日のクライアント状況">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">クライアント名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">アップロード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">出庫実績</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">最終アクティビティ</th>
                </tr>
              </thead>
              <tbody>
                {todayClients.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-mono font-medium text-gray-900">{row.code}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{row.name}</td>
                    <td className="py-3 px-4 text-sm">
                      {row.upload === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.upload === null && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.shipment === 'success' && <StatusBadge status="success">OK</StatusBadge>}
                      {row.shipment === null && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{row.lastActivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
      </RoleGuard>
    </div>
  );
}
