import { setStringAsync } from 'expo-clipboard';

/** Copies a key fact's value (DET-6). The only place the documents feature touches the clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  await setStringAsync(text);
}
