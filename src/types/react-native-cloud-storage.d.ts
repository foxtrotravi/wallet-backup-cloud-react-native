/**
 * Minimal type declarations for react-native-cloud-storage.
 * Used for TypeScript compilation only — the real module (or its jest mock)
 * is used at runtime.
 */

declare module 'react-native-cloud-storage' {
  export const CloudStorage: {
    isAvailable(): Promise<boolean>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    unlink(path: string): Promise<void>;
  };
}
