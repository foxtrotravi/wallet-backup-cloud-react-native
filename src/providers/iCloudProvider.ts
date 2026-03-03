/**
 * @foxtrotravi/backup-cloud-react-native
 * ICloudProvider — stores the encrypted master key in the device's iCloud
 * via `react-native-cloud-storage` using `CloudStorageScope.AppData`.
 *
 * Design constraints:
 *  - File stored via AppData scope (app-specific hidden folder).
 *  - File path is configurable for per-user naming.
 *  - Payload is `CloudEncryptionKeyFile` JSON.
 *  - Handles: iCloud disabled, user not signed in, quota errors, I/O errors.
 *  - Never logs the encrypted key material.
 */

import { CloudStorage, CloudStorageScope } from "react-native-cloud-storage";
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from "../errors.js";
import type {
  CloudEncryptionKeyFile,
  CloudProvider,
  ICloudConfig,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FILE_PATH = "wallet_backup_key.json";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ICloudProvider implements CloudProvider {
  private readonly filePath: string;
  private readonly cloudEmail: string;

  constructor(config: ICloudConfig = {}) {
    this.filePath = config.filePath ?? DEFAULT_FILE_PATH;
    this.cloudEmail = config.cloudEmail ?? "";
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async upload(encryptedKey: string): Promise<void> {
    await this.assertAvailable();

    const payload: CloudEncryptionKeyFile = {
      encryptionKey: encryptedKey,
      savedAt: new Date().toISOString(),
      platform: "ios",
      version: "1.0",
      cloudEmail: this.cloudEmail,
    };

    try {
      await CloudStorage.writeFile(
        this.filePath,
        JSON.stringify(payload),
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      throw this.mapError(cause, "Failed to write backup to iCloud");
    }

    try {
      const verified = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
      if (!verified) {
        throw new CloudStorageError(
          "iCloud backup failed: file not found after write",
        );
      }
    } catch (cause) {
      if (cause instanceof CloudStorageError) throw cause;
      throw this.mapError(cause, "Failed to verify iCloud backup");
    }
  }

  async download(): Promise<string | null> {
    await this.assertAvailable();

    let fileExists: boolean;
    try {
      fileExists = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      throw this.mapError(cause, "Failed to check iCloud file existence");
    }

    if (!fileExists) return null;

    let raw: string;
    try {
      raw = await CloudStorage.readFile(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      throw this.mapError(cause, "Failed to read backup from iCloud");
    }

    const payload = this.parsePayload(raw);
    return payload.encryptionKey;
  }

  async delete(): Promise<void> {
    await this.assertAvailable();

    let fileExists: boolean;
    try {
      fileExists = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      throw this.mapError(cause, "Failed to check iCloud file existence");
    }

    if (!fileExists) return;

    try {
      await CloudStorage.unlink(this.filePath, CloudStorageScope.AppData);
    } catch (cause) {
      throw this.mapError(cause, "Failed to delete backup from iCloud");
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const available = await CloudStorage.isCloudAvailable();
      return available;
    } catch {
      return false;
    }
  }

  async exists(): Promise<boolean> {
    try {
      const available = await CloudStorage.isCloudAvailable();
      if (!available) return false;

      return await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
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
      available = await CloudStorage.isCloudAvailable();
    } catch (cause) {
      throw new CloudUnavailableError(
        "iCloud availability check failed",
        cause,
      );
    }

    if (!available) {
      throw new CloudUnavailableError(
        "iCloud is not available. Ensure iCloud Drive is enabled in Settings.",
      );
    }
  }

  /**
   * Map react-native-cloud-storage errors to our typed error hierarchy.
   */
  private mapError(cause: unknown, context: string): Error {
    const msg =
      cause instanceof Error ? cause.message.toLowerCase() : String(cause);

    if (
      msg.includes("not signed in") ||
      msg.includes("icloud account") ||
      msg.includes("no account")
    ) {
      return new CloudAuthError(
        `iCloud user not signed in — ${context}`,
        cause,
      );
    }

    if (
      msg.includes("quota") ||
      msg.includes("insufficient storage") ||
      msg.includes("storage full")
    ) {
      return new CloudStorageError(
        `iCloud storage quota exceeded — ${context}`,
        cause,
      );
    }

    if (
      msg.includes("unavailable") ||
      msg.includes("disabled") ||
      msg.includes("not available")
    ) {
      return new CloudUnavailableError(
        `iCloud service unavailable — ${context}`,
        cause,
      );
    }

    return new CloudStorageError(`${context}: ${msg}`, cause);
  }

  /** Narrow raw JSON string → `CloudEncryptionKeyFile` defensively. */
  private parsePayload(raw: string): CloudEncryptionKeyFile {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause) {
      throw new CloudStorageError(
        "iCloud backup file contains invalid JSON",
        cause,
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>)["encryptionKey"] !== "string"
    ) {
      throw new CloudStorageError(
        "iCloud backup payload has an unexpected shape",
      );
    }

    return parsed as CloudEncryptionKeyFile;
  }
}
