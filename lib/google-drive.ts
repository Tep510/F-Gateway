import { google, drive_v3 } from 'googleapis'
import { prisma } from './prisma'
import { log } from './systemLog'

// Service account credentials from environment
let driveClient: drive_v3.Drive | null = null

// Setting keys
const DRIVE_SETTING_KEYS = {
  sharedDriveId: 'google_drive_shared_drive_id',
  shippingPlan: 'google_drive_shipping_plan_folder_id',
  shippingResult: 'google_drive_shipping_result_folder_id',
  receivingPlan: 'google_drive_receiving_plan_folder_id',
  receivingResult: 'google_drive_receiving_result_folder_id',
  initialized: 'google_drive_initialized',
}

// Folder names to create
const FOLDER_NAMES = {
  shippingPlan: 'OUT_Forecast',
  shippingResult: 'OUT_Actual',
  receivingPlan: 'IN_Forecast',
  receivingResult: 'IN_Actual',
}

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
 * Get Google Drive settings from database
 */
export interface DriveSettings {
  sharedDriveId: string | null
  shippingPlanFolderId: string | null
  shippingResultFolderId: string | null
  receivingPlanFolderId: string | null
  receivingResultFolderId: string | null
  initialized: boolean
}

export async function getDriveSettings(): Promise<DriveSettings> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      settingKey: {
        in: Object.values(DRIVE_SETTING_KEYS),
      },
    },
  })

  const settingsMap = new Map(settings.map(s => [s.settingKey, s.settingValue]))

  return {
    sharedDriveId: settingsMap.get(DRIVE_SETTING_KEYS.sharedDriveId) || null,
    shippingPlanFolderId: settingsMap.get(DRIVE_SETTING_KEYS.shippingPlan) || null,
    shippingResultFolderId: settingsMap.get(DRIVE_SETTING_KEYS.shippingResult) || null,
    receivingPlanFolderId: settingsMap.get(DRIVE_SETTING_KEYS.receivingPlan) || null,
    receivingResultFolderId: settingsMap.get(DRIVE_SETTING_KEYS.receivingResult) || null,
    initialized: settingsMap.get(DRIVE_SETTING_KEYS.initialized) === 'true',
  }
}

/**
 * Save a drive setting
 */
async function saveDriveSetting(key: string, value: string, description: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { settingKey: key },
    create: {
      settingKey: key,
      settingValue: value,
      description,
    },
    update: {
      settingValue: value,
      updatedAt: new Date(),
    },
  })
}

/**
 * Create a folder in a Shared Drive
 */
async function createFolderInSharedDrive(
  drive: drive_v3.Drive,
  folderName: string,
  sharedDriveId: string
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [sharedDriveId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  if (!response.data.id) {
    throw new Error(`Failed to create folder: ${folderName}`)
  }

  return response.data.id
}

/**
 * Check if a folder exists and is accessible
 */
async function checkFolderExists(
  drive: drive_v3.Drive,
  folderId: string
): Promise<{ exists: boolean; name?: string }> {
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, trashed',
      supportsAllDrives: true,
    })
    if (response.data.trashed) {
      return { exists: false }
    }
    return { exists: true, name: response.data.name || undefined }
  } catch {
    return { exists: false }
  }
}

/**
 * Initialize Google Drive folders
 * Creates the 4 required folders in the shared drive if they don't exist
 */
export async function initializeDriveFolders(sharedDriveId: string): Promise<{
  success: boolean
  error?: string
  folders?: {
    shippingPlan: { id: string; name: string; created: boolean }
    shippingResult: { id: string; name: string; created: boolean }
    receivingPlan: { id: string; name: string; created: boolean }
    receivingResult: { id: string; name: string; created: boolean }
  }
}> {
  try {
    const drive = await getDriveClient()

    // First, verify shared drive access
    try {
      await drive.files.get({
        fileId: sharedDriveId,
        fields: 'id, name',
        supportsAllDrives: true,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      return {
        success: false,
        error: `共有ドライブにアクセスできません: ${err}`,
      }
    }

    // Get current settings
    const currentSettings = await getDriveSettings()

    // Result object
    const folders: {
      shippingPlan: { id: string; name: string; created: boolean }
      shippingResult: { id: string; name: string; created: boolean }
      receivingPlan: { id: string; name: string; created: boolean }
      receivingResult: { id: string; name: string; created: boolean }
    } = {
      shippingPlan: { id: '', name: FOLDER_NAMES.shippingPlan, created: false },
      shippingResult: { id: '', name: FOLDER_NAMES.shippingResult, created: false },
      receivingPlan: { id: '', name: FOLDER_NAMES.receivingPlan, created: false },
      receivingResult: { id: '', name: FOLDER_NAMES.receivingResult, created: false },
    }

    // Check/create each folder
    const folderConfigs = [
      { key: 'shippingPlan', settingKey: DRIVE_SETTING_KEYS.shippingPlan, currentId: currentSettings.shippingPlanFolderId, name: FOLDER_NAMES.shippingPlan, desc: '出庫予定フォルダID' },
      { key: 'shippingResult', settingKey: DRIVE_SETTING_KEYS.shippingResult, currentId: currentSettings.shippingResultFolderId, name: FOLDER_NAMES.shippingResult, desc: '出庫実績フォルダID' },
      { key: 'receivingPlan', settingKey: DRIVE_SETTING_KEYS.receivingPlan, currentId: currentSettings.receivingPlanFolderId, name: FOLDER_NAMES.receivingPlan, desc: '入庫予定フォルダID' },
      { key: 'receivingResult', settingKey: DRIVE_SETTING_KEYS.receivingResult, currentId: currentSettings.receivingResultFolderId, name: FOLDER_NAMES.receivingResult, desc: '入庫実績フォルダID' },
    ]

    for (const config of folderConfigs) {
      let folderId = config.currentId
      let created = false

      // Check if existing folder is still valid
      if (folderId) {
        const check = await checkFolderExists(drive, folderId)
        if (!check.exists) {
          folderId = null // Need to create new folder
        }
      }

      // Create folder if needed
      if (!folderId) {
        folderId = await createFolderInSharedDrive(drive, config.name, sharedDriveId)
        created = true

        // Save to database
        await saveDriveSetting(config.settingKey, folderId, config.desc)

        await log.info('settings', 'folder_created', `フォルダを作成しました: ${config.name}`, {
          metadata: { folderId, folderName: config.name },
        })
      }

      folders[config.key as keyof typeof folders] = {
        id: folderId,
        name: config.name,
        created,
      }
    }

    // Save shared drive ID and mark as initialized
    await saveDriveSetting(DRIVE_SETTING_KEYS.sharedDriveId, sharedDriveId, '共有ドライブID')
    await saveDriveSetting(DRIVE_SETTING_KEYS.initialized, 'true', 'Google Drive初期化完了フラグ')

    await log.info('settings', 'drive_initialized', 'Google Driveの初期化が完了しました', {
      metadata: { sharedDriveId, folders },
    })

    return {
      success: true,
      folders,
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    await log.error('settings', 'drive_initialization_failed', 'Google Drive初期化エラー', err, {
      metadata: { sharedDriveId },
    })
    return {
      success: false,
      error: err.message,
    }
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

  // Check if initialized
  if (!settings.initialized) {
    return {
      success: false,
      error: 'Google Driveが初期化されていません。管理画面で初期化を実行してください。',
    }
  }

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
  initialized: boolean
  hasCredentials: boolean
  sharedDriveId: string | null
}> {
  const hasCredentials = !!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  const settings = await getDriveSettings()

  return {
    configured: hasCredentials && settings.initialized,
    initialized: settings.initialized,
    hasCredentials,
    sharedDriveId: settings.sharedDriveId,
  }
}

export { DRIVE_SETTING_KEYS, FOLDER_NAMES }
