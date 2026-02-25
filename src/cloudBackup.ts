/**
 * @wallet/backup-cloud-react-native
 * CloudBackup — public facade that wraps any CloudProvider.
 *
 * Responsibilities:
 *  - Validate inputs (non-empty key)
 *  - Delegate to the injected provider
 *  - Never log sensitive data
 *  - Normalise provider errors (re-throw as-is, since providers already use
 *    our typed error classes)
 */

import { CloudValidationError } from './errors.js';
import type { CloudProvider } from './types.js';

export class CloudBackup {
  private readonly provider: CloudProvider;

  constructor(provider: CloudProvider) {
    this.provider = provider;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Upload the encrypted master key to cloud storage.
   *
   * @param key - The encrypted wallet master key (must be non-empty).
   * @throws {CloudValidationError} if `key` is empty or whitespace-only.
   * @throws {CloudUnavailableError} if the cloud service is unreachable.
   * @throws {CloudAuthError} if credentials are invalid.
   * @throws {CloudStorageError} if the write fails.
   */
  async uploadEncryptedKey(key: string): Promise<void> {
    this.validateKey(key);
    // Delegate — no logging of key material
    await this.provider.upload(key);
  }

  /**
   * Download the encrypted master key from cloud storage.
   *
   * @returns The encrypted key string, or `null` if no backup exists yet.
   * @throws {CloudUnavailableError} if the cloud service is unreachable.
   * @throws {CloudAuthError} if credentials are invalid.
   * @throws {CloudStorageError} if the read fails.
   */
  async downloadEncryptedKey(): Promise<string | null> {
    return this.provider.download();
  }

  /**
   * Permanently delete the cloud backup.
   * Idempotent — safe to call even when no backup exists.
   *
   * @throws {CloudUnavailableError} if the cloud service is unreachable.
   * @throws {CloudAuthError} if credentials are invalid.
   * @throws {CloudStorageError} if the delete fails.
   */
  async deleteBackup(): Promise<void> {
    return this.provider.delete();
  }

  /**
   * Check whether the cloud provider is accessible right now.
   *
   * @returns `true` if available, `false` otherwise (never throws).
   */
  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private validateKey(key: string): void {
    if (key.trim().length === 0) {
      throw new CloudValidationError(
        'Encrypted key must be a non-empty string',
      );
    }
  }
}
