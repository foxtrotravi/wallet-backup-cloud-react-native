/**
 * @wallet/backup-cloud-react-native
 * Core type definitions — no runtime code.
 */

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

/**
 * Abstraction over any cloud storage backend.
 * Implementations must be stateless between calls (no singleton caches).
 */
export interface CloudProvider {
  /**
   * Store `encryptedKey` in the provider's cloud storage.
   * If a backup already exists, it MUST be overwritten.
   */
  upload(encryptedKey: string): Promise<void>;

  /**
   * Retrieve the stored encrypted key.
   * Returns `null` if no backup exists yet.
   */
  download(): Promise<string | null>;

  /**
   * Permanently remove the stored backup.
   * Must be idempotent — calling on a missing file must NOT throw.
   */
  delete(): Promise<void>;

  /**
   * Returns `true` if the provider is accessible right now.
   * Should be a lightweight probe — not a full upload/download.
   */
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Provider configurations
// ---------------------------------------------------------------------------

/**
 * Config for {@link GoogleDriveProvider}.
 * The caller is responsible for acquiring and refreshing the token.
 * This SDK performs NO OAuth flows.
 */
export interface GoogleDriveConfig {
  /** A valid OAuth2 access token scoped to `drive.appdata`. */
  readonly accessToken: string;
}

/**
 * Config for {@link ICloudProvider}.
 */
export interface ICloudConfig {
  /**
   * Override the default iCloud file path.
   * Default: `/wallet/wallet_backup_key.json`
   */
  readonly filePath?: string;
}

// ---------------------------------------------------------------------------
// Stored payload shape
// ---------------------------------------------------------------------------

/**
 * The JSON blob written to cloud storage by every provider.
 */
export interface BackupFilePayload {
  /** Schema version — bump when the payload shape changes */
  readonly version: 1;
  /** The encrypted wallet master key (already encrypted by the crypto module) */
  readonly encryptedKey: string;
  /** ISO-8601 UTC timestamp when the backup was created */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Internal Drive API response shapes (not exported)
// ---------------------------------------------------------------------------

/** A single Google Drive file resource */
export interface DriveFile {
  readonly id: string;
  readonly name: string;
}

/** Google Drive file-list response */
export interface DriveFileListResponse {
  readonly files: DriveFile[];
}
