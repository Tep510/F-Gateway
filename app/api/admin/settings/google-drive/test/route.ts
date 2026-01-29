import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getDriveClient, getDriveSettings, isDriveConfigured } from '@/lib/google-drive'

/**
 * Test Google Drive connectivity
 */
export async function POST() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check basic configuration
    const config = await isDriveConfigured()

    if (!config.hasCredentials) {
      return NextResponse.json({
        success: false,
        error: 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON 環境変数が設定されていません',
        config,
      })
    }

    // Try to initialize the Drive client
    try {
      const drive = await getDriveClient()

      // Get settings
      const settings = await getDriveSettings()

      // Test access to each configured folder
      const folderTests: Record<string, { configured: boolean; accessible?: boolean; error?: string }> = {}

      if (settings.shippingPlanFolderId) {
        try {
          await drive.files.get({
            fileId: settings.shippingPlanFolderId,
            fields: 'id, name',
          })
          folderTests.shippingPlan = { configured: true, accessible: true }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          folderTests.shippingPlan = { configured: true, accessible: false, error: err }
        }
      } else {
        folderTests.shippingPlan = { configured: false }
      }

      if (settings.shippingResultFolderId) {
        try {
          await drive.files.get({
            fileId: settings.shippingResultFolderId,
            fields: 'id, name',
          })
          folderTests.shippingResult = { configured: true, accessible: true }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          folderTests.shippingResult = { configured: true, accessible: false, error: err }
        }
      } else {
        folderTests.shippingResult = { configured: false }
      }

      if (settings.receivingPlanFolderId) {
        try {
          await drive.files.get({
            fileId: settings.receivingPlanFolderId,
            fields: 'id, name',
          })
          folderTests.receivingPlan = { configured: true, accessible: true }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          folderTests.receivingPlan = { configured: true, accessible: false, error: err }
        }
      } else {
        folderTests.receivingPlan = { configured: false }
      }

      if (settings.receivingResultFolderId) {
        try {
          await drive.files.get({
            fileId: settings.receivingResultFolderId,
            fields: 'id, name',
          })
          folderTests.receivingResult = { configured: true, accessible: true }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          folderTests.receivingResult = { configured: true, accessible: false, error: err }
        }
      } else {
        folderTests.receivingResult = { configured: false }
      }

      // Check overall status
      const allAccessible = Object.values(folderTests).every(
        f => !f.configured || f.accessible
      )

      return NextResponse.json({
        success: true,
        message: allAccessible ? 'Google Drive接続テスト成功' : '一部のフォルダにアクセスできません',
        config,
        folderTests,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      return NextResponse.json({
        success: false,
        error: `Google Drive API初期化エラー: ${err}`,
        config,
      })
    }
  } catch (error) {
    console.error('Google Drive test error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
