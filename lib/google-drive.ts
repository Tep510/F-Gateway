import { google, drive_v3 } from 'googleapis'
import { prisma } from './prisma'
import { log } from './systemLog'

// Service account credentials from environment
let driveClient: drive_v3.Drive | null = null

/**
 * Initialize Google Drive API client with service account
 */
export async function getDriveClient(): Promise<drive_v3.Drive> {
  if (driveClient) {
    return driveClient
  }

  const serviceAccountJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON

  if (!serviceAccountJson) {
    throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON environment variable is not set')
  }

  let credentials
  try {
    credentials = JSON.parse(serviceAccountJson)
  } catch (e) {
    throw new Error('Failed to parse GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: Invalid JSON')
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  driveClient = google.drive({ version: 'v3', auth })
  return driveClient
}

/**
 * Get Google Drive folder settings from database
 */
export interface DriveSettings {
  shippingPlanFolderId: string | null
  shippingResultFolderId: string | null
  receivingPlanFolderId: string | null
  receivingResultFolderId: string | null
}

export async function getDriveSettings(): Promise<DriveSettings> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      settingKey: {
        in: [
          'google_drive_shipping_plan_folder_id',
          'google_drive_shipping_result_folder_id',
          'google_drive_receiving_plan_folder_id',
          'google_drive_receiving_result_folder_id',
        ],
      },
    },
  })

  const settingsMap = new Map(settings.map(s => [s.settingKey, s.settingValue]))

  return {
    shippingPlanFolderId: settingsMap.get('google_drive_shipping_plan_folder_id') || null,
    shippingResultFolderId: settingsMap.get('google_drive_shipping_result_folder_id') || null,
    receivingPlanFolderId: settingsMap.get('google_drive_receiving_plan_folder_id') || null,
    receivingResultFolderId: settingsMap.get('google_drive_receiving_result_folder_id') || null,
  }
}

/**
 * Upload a file to Google Drive
 */
export interface UploadResult {
  success: boolean
  fileId?: string
  webViewLink?: string
  error?: string
}

export async function uploadFileToDrive(
  fileName: string,
  content: Buffer | string,
  folderId: string,
  mimeType: string = 'text/csv'
): Promise<UploadResult> {
  try {
    const drive = await getDriveClient()

    // Convert string to buffer if needed
    const fileContent = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content

    // Create file metadata
    const fileMetadata: drive_v3.Schema$File = {
      name: fileName,
      parents: [folderId],
    }

    // Upload file (supportsAllDrives for Shared Drives)
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType,
        body: require('stream').Readable.from(fileContent),
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })

    if (!response.data.id) {
      return {
        success: false,
        error: 'Failed to get file ID from Google Drive response',
      }
    }

    return {
      success: true,
      fileId: response.data.id,
      webViewLink: response.data.webViewLink || undefined,
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    await log.error('file_transfer', 'drive_upload_failed', `Google Drive upload failed: ${fileName}`, err, {
      metadata: { fileName, folderId },
    })
    return {
      success: false,
      error: err.message,
    }
  }
}

/**
 * Upload CSV to the appropriate folder based on type
 */
export async function uploadCsvToDrive(
  fileName: string,
  content: Buffer | string,
  uploadType: 'shipping' | 'receiving',
  clientId: number,
  requestId?: string
): Promise<UploadResult> {
  const settings = await getDriveSettings()

  // Determine which folder to use
  const folderId = uploadType === 'shipping'
    ? settings.shippingPlanFolderId
    : settings.receivingPlanFolderId

  if (!folderId) {
    const folderName = uploadType === 'shipping' ? '出庫予定' : '入庫予定'
    await log.warn('file_transfer', 'folder_not_configured', `${folderName}フォルダが設定されていません`, {
      clientId,
      requestId,
      metadata: { uploadType },
    })
    return {
      success: false,
      error: `${folderName}フォルダがシステム設定で未設定です`,
    }
  }

  await log.info('file_transfer', 'drive_upload_start', `Google Driveアップロード開始: ${fileName}`, {
    clientId,
    requestId,
    metadata: { uploadType, folderId },
  })

  const result = await uploadFileToDrive(fileName, content, folderId)

  if (result.success) {
    await log.info('file_transfer', 'drive_upload_success', `Google Driveアップロード成功: ${fileName}`, {
      clientId,
      requestId,
      metadata: { uploadType, fileId: result.fileId },
    })
  }

  return result
}

/**
 * Check if Google Drive is properly configured
 */
export async function isDriveConfigured(): Promise<{
  configured: boolean
  hasCredentials: boolean
  hasShippingFolder: boolean
  hasReceivingFolder: boolean
}> {
  const hasCredentials = !!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  const settings = await getDriveSettings()

  return {
    configured: hasCredentials && (!!settings.shippingPlanFolderId || !!settings.receivingPlanFolderId),
    hasCredentials,
    hasShippingFolder: !!settings.shippingPlanFolderId,
    hasReceivingFolder: !!settings.receivingPlanFolderId,
  }
}
