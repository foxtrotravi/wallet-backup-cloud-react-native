/**
 * Manual mock for `react-native-cloud-storage`.
 * Provides Jest mock functions for every method used by ICloudProvider.
 */

export const CloudStorage = {
  isAvailable: jest.fn<Promise<boolean>, []>(),
  writeFile: jest.fn<Promise<void>, [string, string]>(),
  readFile: jest.fn<Promise<string>, [string]>(),
  exists: jest.fn<Promise<boolean>, [string]>(),
  unlink: jest.fn<Promise<void>, [string]>(),
};
