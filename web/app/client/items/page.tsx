import ModernHeader from '@/app/components/ModernHeader';
import Card from '@/app/components/Card';
import StatusBadge from '@/app/components/StatusBadge';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ItemsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/');
  }

  const mockItems = [
    { id: 1, itemCode: 'ITEM-001', name: 'T恤 Mサイズ', category: '衣類', stock: 120, lastUpdated: '2026-01-27' },
    { id: 2, itemCode: 'ITEM-002', name: 'T恤 Lサイズ', category: '衣類', stock: 85, lastUpdated: '2026-01-27' },
    { id: 3, itemCode: 'ITEM-003', name: 'ポロシャツ S', category: '衣類', stock: 45, lastUpdated: '2026-01-26' },
    { id: 4, itemCode: 'ITEM-004', name: 'ポロシャツ M', category: '衣類', stock: 62, lastUpdated: '2026-01-26' },
    { id: 5, itemCode: 'ITEM-005', name: 'ジャケット M', category: '外套', stock: 23, lastUpdated: '2026-01-25' },
    { id: 6, itemCode: 'ITEM-006', name: 'ジャケット L', category: '外套', stock: 18, lastUpdated: '2026-01-25' },
    { id: 7, itemCode: 'ITEM-007', name: 'スラックス M', category: 'パンツ', stock: 34, lastUpdated: '2026-01-27' },
    { id: 8, itemCode: 'ITEM-008', name: 'スラックス L', category: 'パンツ', stock: 29, lastUpdated: '2026-01-27' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <ModernHeader
        scope={session.user.clientCode || "Client"}
        userEmail={session.user.email || ""}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">商品マスタ</h1>
            <p className="text-gray-600 mt-1">商品データの確認と管理</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500">最終更新</div>
              <div className="text-sm font-medium text-gray-700">2026-01-27 14:30</div>
            </div>
            <StatusBadge status="success">同期済み</StatusBadge>
          </div>
        </div>

        {/* Summary */}
        <Card title="商品マスタサマリー" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600">総商品数</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">{mockItems.length}品</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">アクティブ商品</div>
              <div className="text-3xl font-bold text-green-600 mt-1">{mockItems.length}品</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">カテゴリ数</div>
              <div className="text-3xl font-bold text-blue-600 mt-1">
                {new Set(mockItems.map(i => i.category)).size}種
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">累計在庫</div>
              <div className="text-3xl font-bold text-purple-600 mt-1">
                {mockItems.reduce((sum, i) => sum + i.stock, 0)}件
              </div>
            </div>
          </div>
        </Card>

        {/* Item List */}
        <Card title="商品一覧">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="商品コード・名称で検索"
                className="px-3 py-2 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                readOnly
              />
              <select className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" defaultValue="">
                <option value="">カテゴリ全て</option>
                {[...new Set(mockItems.map(i => i.category))].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
              CSVインポート
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">商品コード</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">商品名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">カテゴリ</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">在庫数</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">最終更新</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {mockItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-mono text-gray-900">{item.itemCode}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{item.name}</td>
                    <td className="py-3 px-4 text-sm">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{item.category}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-gray-900">{item.stock}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{item.lastUpdated}</td>
                    <td className="py-3 px-4 text-sm">
                      <button className="text-blue-600 hover:text-blue-800 text-sm">編集</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
