import ModernHeader from '@/app/components/ModernHeader';
import RoleGuard from '@/app/components/RoleGuard';
import Card from '@/app/components/Card';
import StatusBadge from '@/app/components/StatusBadge';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ReceivingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/');
  }

  const mockReceivingData = [
    { id: 1, date: '2026-01-28', fileName: 'receiving_20260128.csv', status: 'success' as const, items: 28 },
    { id: 2, date: '2026-01-27', fileName: 'receiving_20260127.csv', status: 'success' as const, items: 45 },
    { id: 3, date: '2026-01-24', fileName: 'receiving_20260124.csv', status: 'success' as const, items: 19 },
    { id: 4, date: '2026-01-23', fileName: 'receiving_20260123.csv', status: 'warning' as const, items: 12 },
    { id: 5, date: '2026-01-22', fileName: 'receiving_20260122.csv', status: 'success' as const, items: 33 },
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">入庫</h1>
          <p className="text-gray-600 mt-1">入庫データの確認と管理</p>
        </div>

        {/* Summary */}
        <Card title="今月の入庫サマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600">総入庫回数</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">5回</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">成功</div>
              <div className="text-3xl font-bold text-green-600 mt-1">4回</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">警告</div>
              <div className="text-3xl font-bold text-yellow-600 mt-1">1回</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">累計商品数</div>
              <div className="text-3xl font-bold text-blue-600 mt-1">137件</div>
            </div>
          </div>
        </Card>

        {/* Receiving List */}
        <Card title="入庫履歴">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">日付</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ファイル名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">商品数</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ステータス</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {mockReceivingData.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{row.date}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{row.fileName}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{row.items}件</td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={row.status}>
                        {row.status === 'success' ? '完了' : row.status === 'warning' ? '警告' : 'エラー'}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <button className="text-blue-600 hover:text-blue-800 text-sm">詳細</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Upload area placeholder */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <p className="text-gray-600 text-sm">入庫CSVファイルをここにドロップ</p>
              <p className="text-gray-400 text-xs mt-1">または下のボタンでファイルを選択</p>
              <button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
                ファイル選択
              </button>
            </div>
          </div>
        </Card>
      </main>
      </RoleGuard>
    </div>
  );
}
