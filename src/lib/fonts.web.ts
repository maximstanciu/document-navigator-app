import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
} from '@expo-google-fonts/onest';
import { useFonts } from 'expo-font';

/**
 * The web preview has no config plugin: the families are registered at runtime under the names
 * `Fonts` in `src/constants/theme.ts` uses. Text shows in the fallback font until they load.
 */
export function useAppFonts() {
  useFonts([
    {
      fontFamily: 'Onest',
      fontDefinitions: [
        { path: Onest_400Regular, weight: 400 },
        { path: Onest_500Medium, weight: 500 },
        { path: Onest_600SemiBold, weight: 600 },
        { path: Onest_700Bold, weight: 700 },
      ],
    },
    {
      fontFamily: 'JetBrainsMono',
      fontDefinitions: [{ path: JetBrainsMono_500Medium, weight: 500 }],
    },
  ]);
}
