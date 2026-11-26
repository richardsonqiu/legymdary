import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export type MealPhoto = {
  /** Larger JPEG data URL for the AI estimate (route limit about 7 MB). */
  analysis: string;
  /** Small JPEG data URL stored on the meal (server limit 300,000 characters). */
  thumb: string;
  /** Local file for the preview. */
  uri: string;
};

const THUMB_MAX = 280_000;

async function render(uri: string, width: number, compress: number): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  return `data:image/jpeg;base64,${out.base64 ?? ""}`;
}

/** Opens the camera or the photo library and returns downscaled copies, or null when cancelled or denied. */
export async function pickMealPhoto(source: "camera" | "library"): Promise<MealPhoto | null> {
  const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === "camera" ? "Camera access is off. Turn it on in Settings." : "Photo access is off. Turn it on in Settings.");
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const uri = res.assets[0].uri;
  const analysis = await render(uri, 1024, 0.7);
  let thumb = await render(uri, 360, 0.55);
  // Step down until it fits the server limit.
  for (const [w, q] of [[280, 0.45], [200, 0.4]] as const) {
    if (thumb.length <= THUMB_MAX) break;
    thumb = await render(uri, w, q);
  }
  return { analysis, thumb, uri };
}
