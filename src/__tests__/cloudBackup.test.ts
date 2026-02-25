import { CloudBackup } from '../cloudBackup';
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
  CloudValidationError,
} from '../errors';
import type { CloudProvider } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides: Partial<CloudProvider> = {}): jest.Mocked<CloudProvider> {
  return {
    upload: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    download: jest.fn<Promise<string | null>, []>().mockResolvedValue(null),
    delete: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    isAvailable: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    ...overrides,
  } as jest.Mocked<CloudProvider>;
}

// ---------------------------------------------------------------------------
// uploadEncryptedKey
// ---------------------------------------------------------------------------

describe('CloudBackup.uploadEncryptedKey', () => {
  it('calls provider.upload with the correct key', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    await backup.uploadEncryptedKey('enc_key_abc123');
    expect(provider.upload).toHaveBeenCalledTimes(1);
    expect(provider.upload).toHaveBeenCalledWith('enc_key_abc123');
  });

  it('throws CloudValidationError for empty string', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    await expect(backup.uploadEncryptedKey('')).rejects.toBeInstanceOf(
      CloudValidationError,
    );
    expect(provider.upload).not.toHaveBeenCalled();
  });

  it('throws CloudValidationError for whitespace-only string', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    await expect(backup.uploadEncryptedKey('   ')).rejects.toBeInstanceOf(
      CloudValidationError,
    );
    expect(provider.upload).not.toHaveBeenCalled();
  });

  it('propagates CloudAuthError from provider', async () => {
    const err = new CloudAuthError('expired');
    const provider = makeProvider({
      upload: jest.fn().mockRejectedValue(err),
    });
    const backup = new CloudBackup(provider);
    await expect(backup.uploadEncryptedKey('valid_key')).rejects.toBe(err);
  });

  it('propagates CloudStorageError from provider', async () => {
    const err = new CloudStorageError('quota');
    const provider = makeProvider({
      upload: jest.fn().mockRejectedValue(err),
    });
    const backup = new CloudBackup(provider);
    await expect(backup.uploadEncryptedKey('valid_key')).rejects.toBe(err);
  });

  it('propagates CloudUnavailableError from provider', async () => {
    const err = new CloudUnavailableError('offline');
    const provider = makeProvider({
      upload: jest.fn().mockRejectedValue(err),
    });
    const backup = new CloudBackup(provider);
    await expect(backup.uploadEncryptedKey('valid_key')).rejects.toBe(err);
  });

  it('accepts keys with leading/trailing spaces (not blank)', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    // key = ' a ' — has non-whitespace chars → valid
    await backup.uploadEncryptedKey(' a ');
    expect(provider.upload).toHaveBeenCalledWith(' a ');
  });
});

// ---------------------------------------------------------------------------
// downloadEncryptedKey
// ---------------------------------------------------------------------------

describe('CloudBackup.downloadEncryptedKey', () => {
  it('returns string when provider returns key', async () => {
    const provider = makeProvider({
      download: jest.fn().mockResolvedValue('downloaded_key'),
    });
    const backup = new CloudBackup(provider);
    const result = await backup.downloadEncryptedKey();
    expect(result).toBe('downloaded_key');
  });

  it('returns null when no backup exists', async () => {
    const provider = makeProvider({
      download: jest.fn().mockResolvedValue(null),
    });
    const backup = new CloudBackup(provider);
    const result = await backup.downloadEncryptedKey();
    expect(result).toBeNull();
  });

  it('calls provider.download exactly once', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    await backup.downloadEncryptedKey();
    expect(provider.download).toHaveBeenCalledTimes(1);
  });

  it('propagates provider error', async () => {
    const err = new CloudStorageError('corrupt');
    const provider = makeProvider({
      download: jest.fn().mockRejectedValue(err),
    });
    const backup = new CloudBackup(provider);
    await expect(backup.downloadEncryptedKey()).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// deleteBackup
// ---------------------------------------------------------------------------

describe('CloudBackup.deleteBackup', () => {
  it('calls provider.delete', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    await backup.deleteBackup();
    expect(provider.delete).toHaveBeenCalledTimes(1);
  });

  it('propagates provider error', async () => {
    const err = new CloudStorageError('cant delete');
    const provider = makeProvider({
      delete: jest.fn().mockRejectedValue(err),
    });
    const backup = new CloudBackup(provider);
    await expect(backup.deleteBackup()).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe('CloudBackup.isAvailable', () => {
  it('returns true when provider says available', async () => {
    const provider = makeProvider({ isAvailable: jest.fn().mockResolvedValue(true) });
    const backup = new CloudBackup(provider);
    await expect(backup.isAvailable()).resolves.toBe(true);
  });

  it('returns false when provider says unavailable', async () => {
    const provider = makeProvider({ isAvailable: jest.fn().mockResolvedValue(false) });
    const backup = new CloudBackup(provider);
    await expect(backup.isAvailable()).resolves.toBe(false);
  });

  it('calls provider.isAvailable exactly once', async () => {
    const provider = makeProvider();
    const backup = new CloudBackup(provider);
    await backup.isAvailable();
    expect(provider.isAvailable).toHaveBeenCalledTimes(1);
  });
});
