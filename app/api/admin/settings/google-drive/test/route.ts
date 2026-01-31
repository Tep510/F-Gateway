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

      // Helper to test folder access (supports Shared Drives)
      const testFolderAccess = async (folderId: string | null, folderName: string) => {
        if (!folderId) {
          return { configured: false }
        }
        try {
          await drive.files.get({
            fileId: folderId,
            fields: 'id, name',
            supportsAllDrives: true,
          })
          return { configured: true, accessible: true }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          return { configured: true, accessible: false, error: err }
        }
      }

      folderTests.shippingPlan = await testFolderAccess(settings.shippingPlanFolderId, 'shippingPlan')
      folderTests.shippingResult = await testFolderAccess(settings.shippingResultFolderId, 'shippingResult')
      folderTests.receivingPlan = await testFolderAccess(settings.receivingPlanFolderId, 'receivingPlan')
      folderTests.receivingResult = await testFolderAccess(settings.receivingResultFolderId, 'receivingResult')

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
