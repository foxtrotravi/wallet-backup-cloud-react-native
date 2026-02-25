/**
 * @wallet/backup-cloud-react-native
 * ICloudProvider — stores the encrypted master key in the device's iCloud
 * via `react-native-cloud-storage`.
 *
 * Design constraints:
 *  - File stored at `/wallet/wallet_backup_key.json` (configurable).
 *  - Payload is `BackupFilePayload` JSON.
 *  - Handles: iCloud disabled, user not signed in, quota errors, I/O errors.
 *  - Never logs the encrypted key material.
 */

import { CloudStorage } from 'react-native-cloud-storage';
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from '../errors.js';
import type {
  BackupFilePayload,
  CloudProvider,
  ICloudConfig,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FILE_PATH = '/wallet/wallet_backup_key.json';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ICloudProvider implements CloudProvider {
  private readonly filePath: string;

  constructor(config: ICloudConfig = {}) {
    this.filePath = config.filePath ?? DEFAULT_FILE_PATH;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async upload(encryptedKey: string): Promise<void> {
    await this.assertAvailable();

    const payload: BackupFilePayload = {
      version: 1,
      encryptedKey,
      createdAt: new Date().toISOString(),
    };

    try {
      await CloudStorage.writeFile(this.filePath, JSON.stringify(payload));
    } catch (cause) {
      throw this.mapError(cause, 'Failed to write backup to iCloud');
    }
  }

  async download(): Promise<string | null> {
    await this.assertAvailable();

    let exists: boolean;
    try {
      exists = await CloudStorage.exists(this.filePath);
    } catch (cause) {
      throw this.mapError(cause, 'Failed to check iCloud file existence');
    }

    if (!exists) return null;

    let raw: string;
    try {
      raw = await CloudStorage.readFile(this.filePath);
    } catch (cause) {
      throw this.mapError(cause, 'Failed to read backup from iCloud');
    }

    const payload = this.parsePayload(raw);
    return payload.encryptedKey;
  }

  async delete(): Promise<void> {
    await this.assertAvailable();

    let exists: boolean;
    try {
      exists = await CloudStorage.exists(this.filePath);
    } catch (cause) {
      throw this.mapError(cause, 'Failed to check iCloud file existence');
    }

    if (!exists) return; // idempotent

    try {
      await CloudStorage.unlink(this.filePath);
    } catch (cause) {
      throw this.mapError(cause, 'Failed to delete backup from iCloud');
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const available = await CloudStorage.isAvailable();
      return available;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Throws CloudUnavailableError or CloudAuthError if iCloud isn't ready. */
  private async assertAvailable(): Promise<void> {
    let available: boolean;
    try {
      available = await CloudStorage.isAvailable();
    } catch (cause) {
      throw new CloudUnavailableError('iCloud availability check failed', cause);
    }

    if (!available) {
      throw new CloudUnavailableError(
        'iCloud is not available. Ensure iCloud Drive is enabled in Settings.',
      );
    }
  }

  /**
   * Map react-native-cloud-storage errors to our typed error hierarchy.
   * Checks the error message for known patterns — the library doesn't export
   * typed error classes.
   */
  private mapError(cause: unknown, context: string): Error {
    const msg =
      cause instanceof Error ? cause.message.toLowerCase() : String(cause);

    // User not signed in to iCloud
    if (
      msg.includes('not signed in') ||
      msg.includes('icloud account') ||
      msg.includes('no account')
    ) {
      return new CloudAuthError(
        `iCloud user not signed in — ${context}`,
        cause,
      );
    }

    // Quota / storage full
    if (
      msg.includes('quota') ||
      msg.includes('insufficient storage') ||
      msg.includes('storage full')
    ) {
      return new CloudStorageError(
        `iCloud storage quota exceeded — ${context}`,
        cause,
      );
    }

    // Service unavailable
    if (
      msg.includes('unavailable') ||
      msg.includes('disabled') ||
      msg.includes('not available')
    ) {
      return new CloudUnavailableError(
        `iCloud service unavailable — ${context}`,
        cause,
      );
    }

    return new CloudStorageError(`${context}: ${msg}`, cause);
  }

  /** Narrow raw JSON string → `BackupFilePayload` defensively. */
  private parsePayload(raw: string): BackupFilePayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause) {
      throw new CloudStorageError(
        'iCloud backup file contains invalid JSON',
        cause,
      );
    }

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      (parsed as Record<string, unknown>)['version'] !== 1 ||
      typeof (parsed as Record<string, unknown>)['encryptedKey'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['createdAt'] !== 'string'
    ) {
      throw new CloudStorageError(
        'iCloud backup payload has an unexpected shape',
      );
    }

    return parsed as BackupFilePayload;
  }
}
