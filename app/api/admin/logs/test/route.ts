import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { log, generateRequestId } from '@/lib/systemLog'

// テスト用: システムログ記録のテスト
export async function POST() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const requestId = generateRequestId()

    // テストログを記録
    await log.info('system', 'test_log', 'テストログ記録', {
      requestId,
      userId: session.user.id,
      metadata: {
        timestamp: new Date().toISOString(),
        userEmail: session.user.email,
        testData: 'これはテストデータです',
      },
    })

    await log.debug('system', 'test_debug', 'デバッグログテスト', {
      requestId,
      metadata: { level: 'debug' },
    })

    await log.warn('system', 'test_warn', '警告ログテスト', {
      requestId,
      metadata: { level: 'warn' },
    })

    return NextResponse.json({
      success: true,
      message: 'テストログを記録しました',
      requestId,
    })
  } catch (error) {
    console.error('Test log error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
