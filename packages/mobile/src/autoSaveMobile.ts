import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export interface MobileSaveResult {
  success: boolean;
  savedLocation: string;
  isMediaGallery: boolean;
  error?: string;
}

/**
 * Auto-saves incoming file on mobile:
 * - Images & Videos -> Saved directly to device Gallery / Photos Camera Roll
 * - Other files (Docs, Zips) -> Saved to sandboxed Documents folder
 */
export async function autoSaveOnMobile(
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<MobileSaveResult> {
  try {
    const isMedia = mimeType.startsWith('image/') || mimeType.startsWith('video/');
    const tempUri = `${FileSystem.cacheDirectory}${fileName}`;

    // Write file to local cache
    await FileSystem.writeAsStringAsync(tempUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (isMedia) {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        const asset = await MediaLibrary.createAssetAsync(tempUri);
        // Clean up temp file
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        return {
          success: true,
          savedLocation: 'Device Photos / Gallery',
          isMediaGallery: true,
        };
      }
    }

    // Non-media or permission fallback: save to Documents folder
    const targetUri = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.moveAsync({ from: tempUri, to: targetUri });

    return {
      success: true,
      savedLocation: `Documents/${fileName}`,
      isMediaGallery: false,
    };
  } catch (err: any) {
    return {
      success: false,
      savedLocation: '',
      isMediaGallery: false,
      error: err.message,
    };
  }
}
