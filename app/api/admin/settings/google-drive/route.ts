import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// System-wide Google Drive folder setting keys
const DRIVE_SETTING_KEYS = {
  shippingPlan: 'google_drive_shipping_plan_folder_id',
  shippingResult: 'google_drive_shipping_result_folder_id',
  receivingPlan: 'google_drive_receiving_plan_folder_id',
  receivingResult: 'google_drive_receiving_result_folder_id',
}

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all Google Drive settings
    const settings = await prisma.systemSetting.findMany({
      where: {
        settingKey: {
          in: Object.values(DRIVE_SETTING_KEYS),
        },
      },
    })

    // Convert to object
    const settingsMap: Record<string, string> = {}
    settings.forEach(s => {
      settingsMap[s.settingKey] = s.settingValue
    })

    return NextResponse.json({
      settings: {
        shippingPlanFolderId: settingsMap[DRIVE_SETTING_KEYS.shippingPlan] || '',
        shippingResultFolderId: settingsMap[DRIVE_SETTING_KEYS.shippingResult] || '',
        receivingPlanFolderId: settingsMap[DRIVE_SETTING_KEYS.receivingPlan] || '',
        receivingResultFolderId: settingsMap[DRIVE_SETTING_KEYS.receivingResult] || '',
      },
    })
  } catch (error) {
    console.error('Google Drive settings GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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
    const {
      shippingPlanFolderId,
      shippingResultFolderId,
      receivingPlanFolderId,
      receivingResultFolderId,
    } = body

    // Upsert each setting
    const updates = [
      {
        key: DRIVE_SETTING_KEYS.shippingPlan,
        value: shippingPlanFolderId || '',
        description: '出庫予定フォルダID（システム全体）',
      },
      {
        key: DRIVE_SETTING_KEYS.shippingResult,
        value: shippingResultFolderId || '',
        description: '出庫実績フォルダID（システム全体）',
      },
      {
        key: DRIVE_SETTING_KEYS.receivingPlan,
        value: receivingPlanFolderId || '',
        description: '入庫予定フォルダID（システム全体）',
      },
      {
        key: DRIVE_SETTING_KEYS.receivingResult,
        value: receivingResultFolderId || '',
        description: '入庫実績フォルダID（システム全体）',
      },
    ]

    for (const update of updates) {
      await prisma.systemSetting.upsert({
        where: { settingKey: update.key },
        create: {
          settingKey: update.key,
          settingValue: update.value,
          description: update.description,
        },
        update: {
          settingValue: update.value,
          updatedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      success: true,
      settings: {
        shippingPlanFolderId: shippingPlanFolderId || '',
        shippingResultFolderId: shippingResultFolderId || '',
        receivingPlanFolderId: receivingPlanFolderId || '',
        receivingResultFolderId: receivingResultFolderId || '',
      },
    })
  } catch (error) {
    console.error('Google Drive settings POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
