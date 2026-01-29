import ModernHeader from '@/app/components/ModernHeader';
import RoleGuard from '@/app/components/RoleGuard';
import Card from '@/app/components/Card';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

// Get days in a month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Format date as MM/DD
function formatDate(day: number): string {
  return String(day).padStart(2, '0');
}

export default async function AdminDashboard() {
  const session = await auth();

  if (!session?.user) {
    redirect('/');
  }

  // Get current date info
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  // Fetch all active clients
  // Client model: id, clientCode, clientName, status
  const clients = await prisma.client.findMany({
    where: { status: 'active' },
    orderBy: { clientCode: 'asc' },
    select: { id: true, clientCode: true, clientName: true },
  });

  // Date range for this month
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

  // Fetch CSV upload logs for this month
  // CsvUploadLog model: id, clientId, fileName, uploadedAt, uploadStatus
  const csvLogs = await prisma.csvUploadLog.findMany({
    where: {
      uploadedAt: { gte: monthStart, lte: monthEnd },
    },
    select: {
      clientId: true,
      fileName: true,
      uploadedAt: true,
    },
  });

  // Fetch product import logs for this month
  // ProductImportLog model: id, clientId, startedAt, importStatus
  const productLogs = await prisma.productImportLog.findMany({
    where: {
      startedAt: { gte: monthStart, lte: monthEnd },
      importStatus: 'completed',
    },
    select: {
      clientId: true,
      startedAt: true,
    },
  });

  // Build a map of client activities by day
  // Key: `${clientId}-${day}-${type}` where type is 'receiving', 'shipping', or 'product'
  const activityMap = new Map<string, boolean>();

  csvLogs.forEach(log => {
    const day = log.uploadedAt.getDate();
    // Determine type from fileName pattern
    const fileName = log.fileName.toLowerCase();
    if (fileName.includes('入荷') || fileName.includes('receiving') || fileName.includes('入庫')) {
      activityMap.set(`${log.clientId}-${day}-receiving`, true);
    }
    if (fileName.includes('出荷') || fileName.includes('shipping') || fileName.includes('出庫')) {
      activityMap.set(`${log.clientId}-${day}-shipping`, true);
    }
    // If no pattern match, mark as shipping (default)
    if (!fileName.includes('入荷') && !fileName.includes('receiving') && !fileName.includes('入庫') &&
        !fileName.includes('出荷') && !fileName.includes('shipping') && !fileName.includes('出庫')) {
      activityMap.set(`${log.clientId}-${day}-shipping`, true);
    }
  });

  productLogs.forEach(log => {
    const day = log.startedAt.getDate();
    activityMap.set(`${log.clientId}-${day}-product`, true);
  });

  // Generate days array
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Month name in Japanese
  const monthName = `${currentYear}年${currentMonth + 1}月`;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ModernHeader scope="Admin" userEmail={session.user.email || ""} role={session.user.role} />
      <RoleGuard role="admin" currentRole={session.user.role}>

      <main className="max-w-full mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ダッシュボード</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{monthName}の稼働状況</p>
        </div>

        {/* Monthly Activity Grid */}
        <Card title="今月のクライアント稼働状況">
          {clients.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 py-8 text-center">
              アクティブなクライアントがありません
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    {/* Client names row */}
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-900 z-10" rowSpan={2}>
                        日付
                      </th>
                      {clients.map(client => (
                        <th
                          key={client.id}
                          colSpan={3}
                          className="py-2 px-1 text-center text-xs font-bold text-gray-900 dark:text-white border-l border-gray-200 dark:border-gray-700"
                        >
                          {client.clientCode}
                        </th>
                      ))}
                    </tr>
                    {/* Sub-headers row */}
                    <tr className="border-b border-gray-300 dark:border-gray-600">
                      {clients.flatMap(client => [
                        <th key={`${client.id}-receiving`} className="py-1 px-1 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">
                          入荷
                        </th>,
                        <th key={`${client.id}-shipping`} className="py-1 px-1 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          出荷
                        </th>,
                        <th key={`${client.id}-product`} className="py-1 px-1 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          商品
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(day => {
                      const isToday = day === currentDay;
                      const isFuture = day > currentDay;

                      return (
                        <tr
                          key={day}
                          className={`
                            border-b border-gray-100 dark:border-gray-800
                            ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                            ${isFuture ? 'opacity-40' : ''}
                          `}
                        >
                          <td className={`
                            py-1.5 px-3 text-xs font-mono sticky left-0 z-10
                            ${isToday
                              ? 'bg-blue-50 dark:bg-blue-900/20 font-bold text-blue-600 dark:text-blue-400'
                              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                            }
                          `}>
                            {currentMonth + 1}/{formatDate(day)}
                            {isToday && <span className="ml-1 text-[10px]">今日</span>}
                          </td>
                          {clients.flatMap(client => {
                            const hasReceiving = activityMap.get(`${client.id}-${day}-receiving`);
                            const hasShipping = activityMap.get(`${client.id}-${day}-shipping`);
                            const hasProduct = activityMap.get(`${client.id}-${day}-product`);

                            return [
                              <td key={`${client.id}-${day}-receiving`} className="py-1.5 px-1 text-center border-l border-gray-100 dark:border-gray-800">
                                {hasReceiving ? (
                                  <span className="text-green-500 dark:text-green-400 font-bold">○</span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600">-</span>
                                )}
                              </td>,
                              <td key={`${client.id}-${day}-shipping`} className="py-1.5 px-1 text-center">
                                {hasShipping ? (
                                  <span className="text-green-500 dark:text-green-400 font-bold">○</span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600">-</span>
                                )}
                              </td>,
                              <td key={`${client.id}-${day}-product`} className="py-1.5 px-1 text-center">
                                {hasProduct ? (
                                  <span className="text-green-500 dark:text-green-400 font-bold">○</span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600">-</span>
                                )}
                              </td>,
                            ];
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <span className="text-green-500 dark:text-green-400 font-bold">○</span>
                  <span>アップロード済み</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-300 dark:text-gray-600">-</span>
                  <span>未アップロード</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded"></span>
                  <span>今日</span>
                </div>
              </div>
            </>
          )}
        </Card>
      </main>
      </RoleGuard>
    </div>
  );
}
