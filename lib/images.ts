import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { info, traced } from './telemetry';

const MAX_SIDE = 1600;

/** Open the camera (never the gallery: photos are taken, not chosen). Resolves to a downsized JPEG uri, or null if cancelled. */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    info('image.camera.denied', { status: perm.status });
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (result.canceled || !result.assets?.length) {
    info('image.pick.cancelled');
    return null;
  }
  const asset = result.assets[0];
  return traced('image.shrink', { width: asset.width, height: asset.height, bytes: asset.fileSize ?? null }, () =>
    shrinkToJpeg(asset.uri, asset.width, asset.height),
  );
}

export async function shrinkToJpeg(uri: string, width?: number, height?: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_SIDE) {
    if (width >= height) ctx.resize({ width: MAX_SIDE, height: null });
    else ctx.resize({ width: null, height: MAX_SIDE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return saved.uri;
}
