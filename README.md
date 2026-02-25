# @wallet/backup-cloud-react-native

Production-grade cloud backup SDK for Expo / React Native wallet apps.  
Stores an encrypted master key in **Google Drive** (appDataFolder) or **iCloud** via a clean provider abstraction.

---

## Installation

```bash
npm install @wallet/backup-cloud-react-native
# iCloud support also requires:
npm install react-native-cloud-storage
```

> **Expo note**: `react-native-cloud-storage` requires native modules. Use a [custom dev build](https://docs.expo.dev/develop/development-builds/introduction/) — it does NOT work with Expo Go.

---

## Requirements

| Platform | Cloud Target | Requirement |
|---|---|---|
| iOS / macOS | iCloud | iCloud Drive enabled in Settings; user signed in |
| Android / iOS | Google Drive | OAuth2 access token with `drive.appdata` scope |

**This SDK performs NO OAuth flows.** You must supply a valid token.

---

## Quick Start

### Google Drive

```ts
import {
  CloudBackup,
  GoogleDriveProvider,
  CloudAuthError,
  CloudUnavailableError,
  CloudStorageError,
  CloudValidationError,
} from '@wallet/backup-cloud-react-native';

// Token must be obtained by the caller (e.g., via expo-auth-session)
const provider = new GoogleDriveProvider({ accessToken: '<your_token>' });
const cloud = new CloudBackup(provider);

// Upload
await cloud.uploadEncryptedKey(encryptedKey);

// Download
const key = await cloud.downloadEncryptedKey(); // string | null

// Delete
await cloud.deleteBackup();

// Availability check
const available = await cloud.isAvailable(); // boolean
```

### iCloud

```ts
import {
  CloudBackup,
  ICloudProvider,
} from '@wallet/backup-cloud-react-native';

const provider = new ICloudProvider(); // default path: /wallet/wallet_backup_key.json
const cloud = new CloudBackup(provider);

await cloud.uploadEncryptedKey(encryptedKey);
```

---

## Error Handling

```ts
import {
  CloudValidationError,
  CloudAuthError,
  CloudUnavailableError,
  CloudStorageError,
} from '@wallet/backup-cloud-react-native';

try {
  await cloud.uploadEncryptedKey(encryptedKey);
} catch (err) {
  if (err instanceof CloudValidationError) {
    // Empty or invalid key passed by caller
  } else if (err instanceof CloudAuthError) {
    // Token expired / user not signed in to iCloud → refresh and retry
  } else if (err instanceof CloudUnavailableError) {
    // No network, iCloud disabled, Drive service down
  } else if (err instanceof CloudStorageError) {
    // Quota exceeded, I/O error, malformed response
  }
}
```

Each error carries a machine-readable `code` discriminant:

| Class | `code` |
|---|---|
| `CloudValidationError` | `CLOUD_VALIDATION_ERROR` |
| `CloudAuthError` | `CLOUD_AUTH_ERROR` |
| `CloudUnavailableError` | `CLOUD_UNAVAILABLE` |
| `CloudStorageError` | `CLOUD_STORAGE_ERROR` |

---

## API Reference

### `CloudBackup`

```ts
new CloudBackup(provider: CloudProvider)
```

| Method | Signature | Description |
|---|---|---|
| `uploadEncryptedKey` | `(key: string) => Promise<void>` | Validate + upload. Throws `CloudValidationError` on empty key. |
| `downloadEncryptedKey` | `() => Promise<string \| null>` | Download or `null` if no backup exists. |
| `deleteBackup` | `() => Promise<void>` | Delete backup (idempotent). |
| `isAvailable` | `() => Promise<boolean>` | Lightweight probe — never throws. |

---

### `GoogleDriveProvider`

```ts
new GoogleDriveProvider(config: GoogleDriveConfig)

interface GoogleDriveConfig {
  accessToken: string; // OAuth2 token — drive.appdata scope required
}
```

- File stored in `appDataFolder` as `wallet_backup_key.json`
- Upserts on upload (create if absent, PATCH if present)
- Uses `fetch` (no extra HTTP library)

---

### `ICloudProvider`

```ts
new ICloudProvider(config?: ICloudConfig)

interface ICloudConfig {
  filePath?: string; // default: /wallet/wallet_backup_key.json
}
```

- Requires `react-native-cloud-storage` peer dependency
- Handles: iCloud not available, user not signed in, quota errors

---

## Implementing a Custom Provider

```ts
import type { CloudProvider } from '@wallet/backup-cloud-react-native';

class MyCustomProvider implements CloudProvider {
  async upload(key: string): Promise<void> { /* ... */ }
  async download(): Promise<string | null> { /* ... */ }
  async delete(): Promise<void> { /* ... */ }
  async isAvailable(): Promise<boolean> { /* ... */ }
}

const cloud = new CloudBackup(new MyCustomProvider());
```

---

## Stored File Format

Both providers write the same JSON payload:

```json
{
  "version": 1,
  "encryptedKey": "<encrypted_wallet_master_key>",
  "createdAt": "2026-02-25T00:00:00.000Z"
}
```

---

## Security Notes

- **Never logs** the encrypted key or access token
- **No AsyncStorage** — entirely in-request-lifecycle
- **No singletons** — providers are stateless
- **No OAuth flows** implemented — the caller owns credential management
- Error messages strip sensitive values

---

## Build

```bash
npm run build    # Outputs dist/ (CJS + ESM + .d.ts)
npm test         # Jest (90%+ coverage required)
npm run typecheck # tsc --noEmit
```

---

## Architecture

```
src/
  types.ts                    # CloudProvider interface + config types
  errors.ts                   # CloudUnavailableError, CloudAuthError,
  │                           #   CloudStorageError, CloudValidationError
  cloudBackup.ts              # Public CloudBackup wrapper
  providers/
    googleDriveProvider.ts    # Drive REST v3 (fetch)
    iCloudProvider.ts         # react-native-cloud-storage
  index.ts                    # Public barrel (named exports only)
  __tests__/
    errors.test.ts
    cloudBackup.test.ts
    googleDriveProvider.test.ts
    iCloudProvider.test.ts
  __mocks__/
    react-native-cloud-storage.ts
examples/
  usage.ts
```

---

## Integration with `@wallet/backup-backend`

```ts
import { BackendBackupClient } from '@wallet/backup-backend';
import {
  CloudBackup,
  GoogleDriveProvider,
} from '@wallet/backup-cloud-react-native';

const backend = new BackendBackupClient({ baseUrl: 'https://api.mywallet.com' });
const cloud = new CloudBackup(new GoogleDriveProvider({ accessToken }));

// Parallel independent uploads
await backend.uploadSeed({ encryptedSeed, authToken, deviceId });
await backend.uploadEntropy({ encryptedEntropy, authToken, deviceId });
await cloud.uploadEncryptedKey(encryptedMasterKey);
```

---

## License

MIT
