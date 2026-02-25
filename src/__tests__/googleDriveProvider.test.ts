import fetchMock from 'jest-fetch-mock';
import { GoogleDriveProvider } from '../providers/googleDriveProvider';

beforeEach(() => {
  fetchMock.resetMocks();
});
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from '../errors';
import type { DriveFileListResponse, BackupFilePayload } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = 'test_access_token';
const ENCRYPTED_KEY = 'encrypted_master_key_hex';

const EMPTY_FILE_LIST: DriveFileListResponse = { files: [] };
const FILE_LIST_WITH_FILE: DriveFileListResponse = {
  files: [{ id: 'file_id_123', name: 'wallet_backup_key.json' }],
};
const VALID_PAYLOAD: BackupFilePayload = {
  version: 1,
  encryptedKey: ENCRYPTED_KEY,
  createdAt: '2026-02-25T00:00:00.000Z',
};

function makeProvider(): GoogleDriveProvider {
  return new GoogleDriveProvider({ accessToken: ACCESS_TOKEN });
}

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.upload', () => {
  it('creates a new file when none exists (POST multipart)', async () => {
    // 1st call: file list (empty) — 2nd call: POST create
    fetchMock.mockResponses(
      [JSON.stringify(EMPTY_FILE_LIST), { status: 200 }],
      [JSON.stringify({ id: 'new_id', name: 'wallet_backup_key.json' }), { status: 200 }],
    );

    await makeProvider().upload(ENCRYPTED_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createCall] = fetchMock.mock.calls;
    expect((createCall![0] as string)).toContain('upload/drive/v3/files');
    expect((createCall![1] as RequestInit).method).toBe('POST');
  });

  it('patches the existing file when one is already present (PATCH)', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
      [JSON.stringify(VALID_PAYLOAD), { status: 200 }],
    );

    await makeProvider().upload(ENCRYPTED_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, patchCall] = fetchMock.mock.calls;
    expect((patchCall![0] as string)).toContain('file_id_123');
    expect((patchCall![1] as RequestInit).method).toBe('PATCH');
  });

  it('throws CloudAuthError on 401 during file list', async () => {
    fetchMock.mockResponseOnce('Unauthorized', { status: 401 });
    await expect(makeProvider().upload(ENCRYPTED_KEY)).rejects.toBeInstanceOf(
      CloudAuthError,
    );
  });

  it('throws CloudAuthError on 403', async () => {
    fetchMock.mockResponseOnce('Forbidden', { status: 403 });
    await expect(makeProvider().upload(ENCRYPTED_KEY)).rejects.toBeInstanceOf(
      CloudAuthError,
    );
  });

  it('throws CloudUnavailableError on network failure', async () => {
    fetchMock.mockRejectOnce(new TypeError('Failed to fetch'));
    await expect(makeProvider().upload(ENCRYPTED_KEY)).rejects.toBeInstanceOf(
      CloudUnavailableError,
    );
  });

  it('throws CloudStorageError when create returns non-2xx', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(EMPTY_FILE_LIST), { status: 200 }],
      ['Server error', { status: 500 }],
    );
    await expect(makeProvider().upload(ENCRYPTED_KEY)).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudStorageError when patch returns non-2xx', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
      ['Server error', { status: 500 }],
    );
    await expect(makeProvider().upload(ENCRYPTED_KEY)).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('sends Authorization header on every request', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(EMPTY_FILE_LIST), { status: 200 }],
      [JSON.stringify({}), { status: 200 }],
    );

    await makeProvider().upload(ENCRYPTED_KEY);

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBe(
        `Bearer ${ACCESS_TOKEN}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.download', () => {
  it('returns encryptedKey when file exists', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
      [JSON.stringify(VALID_PAYLOAD), { status: 200 }],
    );

    const result = await makeProvider().download();
    expect(result).toBe(ENCRYPTED_KEY);
  });

  it('returns null when no file exists', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(EMPTY_FILE_LIST), { status: 200 });
    const result = await makeProvider().download();
    expect(result).toBeNull();
  });

  it('throws CloudStorageError when downloaded payload has wrong shape', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
      [JSON.stringify({ version: 2, bad: 'data' }), { status: 200 }],
    );
    await expect(makeProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudAuthError on 401', async () => {
    fetchMock.mockResponseOnce('', { status: 401 });
    await expect(makeProvider().download()).rejects.toBeInstanceOf(CloudAuthError);
  });

  it('throws CloudUnavailableError on network failure during download', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
    );
    // Second call (media download) throws network error
    fetchMock.mockRejectOnce(new TypeError('Network request failed'));
    await expect(makeProvider().download()).rejects.toBeInstanceOf(
      CloudUnavailableError,
    );
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.delete', () => {
  it('calls DELETE on existing file', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
      ['', { status: 204 }],
    );

    await makeProvider().delete();

    const deleteCall = fetchMock.mock.calls[1];
    expect((deleteCall![1] as RequestInit).method).toBe('DELETE');
    expect((deleteCall![0] as string)).toContain('file_id_123');
  });

  it('is idempotent — does nothing when no file exists', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(EMPTY_FILE_LIST), { status: 200 });
    await expect(makeProvider().delete()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only list call
  });

  it('throws CloudAuthError on 401 during list', async () => {
    fetchMock.mockResponseOnce('', { status: 401 });
    await expect(makeProvider().delete()).rejects.toBeInstanceOf(CloudAuthError);
  });

  it('throws CloudStorageError when delete returns non-204/200', async () => {
    fetchMock.mockResponses(
      [JSON.stringify(FILE_LIST_WITH_FILE), { status: 200 }],
      ['err', { status: 500 }],
    );
    await expect(makeProvider().delete()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.isAvailable', () => {
  it('returns true when Drive API responds 200', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ user: {} }), { status: 200 });
    await expect(makeProvider().isAvailable()).resolves.toBe(true);
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectOnce(new TypeError('offline'));
    await expect(makeProvider().isAvailable()).resolves.toBe(false);
  });

  it('returns false on 5xx response', async () => {
    fetchMock.mockResponseOnce('error', { status: 503 });
    // 503 → driveRequest throws CloudStorageError → caught → false
    await expect(makeProvider().isAvailable()).resolves.toBe(false);
  });

  it('returns false on 401 (token expired)', async () => {
    fetchMock.mockResponseOnce('', { status: 401 });
    // 401 → driveRequest throws CloudAuthError → caught → false
    await expect(makeProvider().isAvailable()).resolves.toBe(false);
  });
});
