// Spike 0.4 (IMPLEMENTATION_PLAN): throwaway screen to try the document scanner on a device.
// Removed once docs/spikes/0.4-scanner.md is written. Logs metadata only, never page content.
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import DocumentScanner, { ResponseType } from 'react-native-document-scanner-plugin';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

type PageInfo = { uri: string; width: number; height: number; bytes: number | null };
type ScanSummary = { label: string; status: string; ms: number; pages: PageInfo[]; error?: string };

function getSize(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 })
    );
  });
}

async function getBytes(uri: string): Promise<number | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob.size;
  } catch {
    return null;
  }
}

async function runScan(label: string, maxNumDocuments?: number): Promise<ScanSummary> {
  const started = Date.now();
  try {
    const result = await DocumentScanner.scanDocument({
      maxNumDocuments,
      responseType: ResponseType.ImageFilePath,
    });
    const uris = result.scannedImages ?? [];
    const pages = await Promise.all(
      uris.map(async (uri) => ({ uri, ...(await getSize(uri)), bytes: await getBytes(uri) }))
    );
    return { label, status: result.status ?? 'unknown', ms: Date.now() - started, pages };
  } catch (error) {
    return { label, status: 'error', ms: Date.now() - started, pages: [], error: String(error) };
  }
}

export function ScannerSpikeScreen() {
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan(label: string, maxNumDocuments?: number) {
    setBusy(true);
    const next = await runScan(label, maxNumDocuments);
    const logged = next.pages.map(({ uri, ...rest }) => ({ file: uri.split('/').pop(), ...rest }));
    console.log('[scanner-spike]', JSON.stringify({ ...next, pages: logged }));
    setSummary(next);
    setBusy(false);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Scanner spike 0.4</ThemedText>
        <Button label="Scan, max 30 pages" disabled={busy} onPress={() => scan('max-30', 30)} />
        <Button label="Scan, max 3 pages" disabled={busy} onPress={() => scan('max-3', 3)} />
        <Button
          label="Scan, no limit"
          variant="secondary"
          disabled={busy}
          onPress={() => scan('no-limit')}
        />
        {summary && (
          <View style={styles.result}>
            <ThemedText type="smallBold">
              {summary.label}: {summary.status}, {summary.pages.length} pages, {summary.ms} ms
            </ThemedText>
            {summary.error && <ThemedText type="small">{summary.error}</ThemedText>}
            {summary.pages.map((page, index) => (
              <View key={page.uri} style={styles.page}>
                <Image source={{ uri: page.uri }} style={styles.thumbnail} />
                <ThemedText type="small">
                  {index + 1}. {page.width}×{page.height},{' '}
                  {page.bytes === null ? 'size n/a' : `${Math.round(page.bytes / 1024)} KB`}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  result: { gap: Spacing.two },
  page: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  thumbnail: { width: 60, height: 80 },
});
