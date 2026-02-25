/**
 * @wallet/backup-cloud-react-native
 * GoogleDriveProvider — stores the encrypted master key in the caller's
 * Google Drive `appDataFolder` using the Drive REST v3 API.
 *
 * Design constraints:
 *  - No Google sign-in logic. The caller injects a valid OAuth2 access token.
 *  - Uses `fetch` (available in React Native / Expo without extra deps).
 *  - All 401 responses map to CloudAuthError.
 *  - Network failures map to CloudUnavailableError.
 *  - All other non-2xx responses map to CloudStorageError.
 *  - Never logs the access token or encrypted key material.
 */

import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from '../errors.js';
import type {
  BackupFilePayload,
  CloudProvider,
  DriveFile,
  DriveFileListResponse,
  GoogleDriveConfig,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVE_FILES_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE =
  'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_FILENAME = 'wallet_backup_key.json';
const SPACES = 'appDataFolder';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class GoogleDriveProvider implements CloudProvider {
  private readonly accessToken: string;

  constructor(config: GoogleDriveConfig) {
    this.accessToken = config.accessToken;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async upload(encryptedKey: string): Promise<void> {
    const payload: BackupFilePayload = {
      version: 1,
      encryptedKey,
      createdAt: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);

    const existingId = await this.findFileId();

    if (existingId !== null) {
      await this.patchFile(existingId, body);
    } else {
      await this.createFile(body);
    }
  }

  async download(): Promise<string | null> {
    const id = await this.findFileId();
    if (id === null) return null;

    const response = await this.driveRequest(
      `${DRIVE_FILES_BASE}/${encodeURIComponent(id)}?alt=media`,
    );

    const raw: unknown = await response.json();
    const payload = this.parsePayload(raw);
    return payload.encryptedKey;
  }

  async delete(): Promise<void> {
    const id = await this.findFileId();
    if (id === null) return; // idempotent

    const response = await this.driveRequest(
      `${DRIVE_FILES_BASE}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );

    if (response.status === 204 || response.status === 200) return;

    throw new CloudStorageError(
      `Delete failed with status ${response.status}`,
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.driveRequest(
        'https://www.googleapis.com/drive/v3/about?fields=user',
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Returns the file id if `BACKUP_FILENAME` exists in appDataFolder. */
  private async findFileId(): Promise<string | null> {
    const q = encodeURIComponent(`name='${BACKUP_FILENAME}'`);
    const url = `${DRIVE_FILES_BASE}?spaces=${SPACES}&q=${q}&fields=files(id,name)`;

    const response = await this.driveRequest(url);
    const raw: unknown = await response.json();
    const list = this.parseDriveFileList(raw);

    return list.files[0]?.id ?? null;
  }

  /** Create a new file in appDataFolder using multipart upload. */
  private async createFile(body: string): Promise<void> {
    const metadata = JSON.stringify({
      name: BACKUP_FILENAME,
      parents: [SPACES],
    });

    const boundary = '-------WalletBackupBoundary';
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      body,
      `--${boundary}--`,
    ].join('\r\n');

    const response = await this.driveRequest(
      `${DRIVE_UPLOAD_BASE}?uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    );

    if (!response.ok) {
      throw new CloudStorageError(
        `Create failed with status ${response.status}`,
      );
    }
  }

  /** Update (PATCH) an existing file's content. */
  private async patchFile(fileId: string, body: string): Promise<void> {
    const response = await this.driveRequest(
      `${DRIVE_UPLOAD_BASE}/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );

    if (!response.ok) {
      throw new CloudStorageError(
        `Update failed with status ${response.status}`,
      );
    }
  }

  /**
   * Central fetch wrapper — attaches the auth header and maps
   * HTTP error codes to typed SDK errors.
   */
  private async driveRequest(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      ...(init.headers as Record<string, string> | undefined),
    };

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (cause) {
      throw new CloudUnavailableError(
        'Google Drive is unreachable (network error)',
        cause,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new CloudAuthError(
        `Google Drive authentication failed (HTTP ${response.status})`,
      );
    }

    if (!response.ok && response.status !== 204) {
      throw new CloudStorageError(
        `Google Drive request failed (HTTP ${response.status})`,
      );
    }

    return response;
  }

  /** Narrow `unknown` → `DriveFileListResponse` defensively. */
  private parseDriveFileList(raw: unknown): DriveFileListResponse {
    if (
      raw === null ||
      typeof raw !== 'object' ||
      !('files' in raw) ||
      !Array.isArray((raw as { files: unknown }).files)
    ) {
      throw new CloudStorageError(
        'Unexpected Google Drive file list response shape',
      );
    }

    const files = (raw as { files: unknown[] }).files.filter(
      (f): f is DriveFile =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as Record<string, unknown>)['id'] === 'string' &&
        typeof (f as Record<string, unknown>)['name'] === 'string',
    );

    return { files };
  }

  /** Narrow `unknown` → `BackupFilePayload` defensively. */
  private parsePayload(raw: unknown): BackupFilePayload {
    if (
      raw === null ||
      typeof raw !== 'object' ||
      (raw as Record<string, unknown>)['version'] !== 1 ||
      typeof (raw as Record<string, unknown>)['encryptedKey'] !== 'string' ||
      typeof (raw as Record<string, unknown>)['createdAt'] !== 'string'
    ) {
      throw new CloudStorageError(
        'Downloaded backup payload has an unexpected shape',
      );
    }

    return raw as BackupFilePayload;
  }
}
