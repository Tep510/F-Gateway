import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getDriveSettings, isDriveConfigured, initializeDriveFolders, FOLDER_NAMES } from '@/lib/google-drive'

/**
 * GET: Get Google Drive settings
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await isDriveConfigured()
    const settings = await getDriveSettings()

    return NextResponse.json({
      hasCredentials: config.hasCredentials,
      initialized: config.initialized,
      sharedDriveId: settings.sharedDriveId || '',
      folders: settings.initialized ? {
        shippingPlan: { id: settings.shippingPlanFolderId, name: FOLDER_NAMES.shippingPlan },
        shippingResult: { id: settings.shippingResultFolderId, name: FOLDER_NAMES.shippingResult },
        receivingPlan: { id: settings.receivingPlanFolderId, name: FOLDER_NAMES.receivingPlan },
        receivingResult: { id: settings.receivingResultFolderId, name: FOLDER_NAMES.receivingResult },
      } : null,
    })
  } catch (error) {
    console.error('Google Drive settings GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST: Initialize Google Drive with shared drive ID
 */
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { sharedDriveId } = body

    if (!sharedDriveId) {
      return NextResponse.json(
        { error: '共有ドライブIDを入力してください' },
        { status: 400 }
      )
    }

    // Extract ID from URL if full URL provided
    let driveId = sharedDriveId
    const folderMatch = sharedDriveId.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (folderMatch) {
      driveId = folderMatch[1]
    } else {
      const idMatch = sharedDriveId.match(/[?&]id=([a-zA-Z0-9_-]+)/)
      if (idMatch) {
        driveId = idMatch[1]
      }
    }

    // Initialize folders
    const result = await initializeDriveFolders(driveId)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Google Driveの初期化が完了しました',
      sharedDriveId: driveId,
      folders: result.folders,
    })
  } catch (error) {
    console.error('Google Drive settings POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
