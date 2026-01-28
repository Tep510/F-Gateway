import { prisma } from './prisma'
import type { Prisma } from '@/app/generated/prisma'

// 日本時間のタイムゾーン
export const JST_TIMEZONE = 'Asia/Tokyo'

/**
 * 日本時間の現在日時を取得
 */
export function getJSTDate(): Date {
  return new Date()
}

/**
 * 日本時間でフォーマットされた日時文字列を取得
 */
export function formatJST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('ja-JP', { timeZone: JST_TIMEZONE })
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogCategory =
  | 'csv_upload'
  | 'csv_conversion'
  | 'product_import'
  | 'file_transfer'
  | 'asana'
  | 'api'
  | 'auth'
  | 'system'
  | 'settings'
  | 'cron'

export interface LogOptions {
  level: LogLevel
  category: LogCategory
  action: string
  message: string
  clientId?: number
  userId?: string
  metadata?: Prisma.InputJsonValue
  errorMessage?: string
  errorStack?: string
  durationMs?: number
  ipAddress?: string
  userAgent?: string
  requestId?: string
}

/**
 * システムログを記録する
 */
export async function systemLog(options: LogOptions): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        logLevel: options.level,
        category: options.category,
        action: options.action,
        message: options.message,
        clientId: options.clientId,
        userId: options.userId,
        metadata: options.metadata,
        errorMessage: options.errorMessage,
        errorStack: options.errorStack,
        durationMs: options.durationMs,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        requestId: options.requestId,
      },
    })
  } catch (error) {
    // ログ記録自体が失敗してもアプリを止めない
    console.error('[SystemLog] Failed to write log:', error)
    console.error('[SystemLog] Original log:', options)
  }
}

/**
 * 処理時間を計測してログを記録するヘルパー
 */
export async function withLogging<T>(
  options: Omit<LogOptions, 'durationMs'>,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  const requestId = options.requestId || generateRequestId()

  try {
    // 開始ログ
    await systemLog({
      ...options,
      level: 'info',
      action: `${options.action}_start`,
      message: `${options.message} - 開始`,
      requestId,
    })

    const result = await fn()
    const durationMs = Date.now() - startTime

    // 完了ログ
    await systemLog({
      ...options,
      level: 'info',
      action: `${options.action}_complete`,
      message: `${options.message} - 完了`,
      durationMs,
      requestId,
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    const err = error instanceof Error ? error : new Error(String(error))

    // エラーログ
    await systemLog({
      ...options,
      level: 'error',
      action: `${options.action}_error`,
      message: `${options.message} - エラー`,
      errorMessage: err.message,
      errorStack: err.stack,
      durationMs,
      requestId,
    })

    throw error
  }
}

/**
 * リクエストIDを生成
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}`
}

// 便利なショートカット関数
export const log = {
  debug: (category: LogCategory, action: string, message: string, options?: Partial<LogOptions>) =>
    systemLog({ level: 'debug', category, action, message, ...options }),

  info: (category: LogCategory, action: string, message: string, options?: Partial<LogOptions>) =>
    systemLog({ level: 'info', category, action, message, ...options }),

  warn: (category: LogCategory, action: string, message: string, options?: Partial<LogOptions>) =>
    systemLog({ level: 'warn', category, action, message, ...options }),

  error: (category: LogCategory, action: string, message: string, error?: Error, options?: Partial<LogOptions>) =>
    systemLog({
      level: 'error',
      category,
      action,
      message,
      errorMessage: error?.message,
      errorStack: error?.stack,
      ...options,
    }),
}
