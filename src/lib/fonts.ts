/**
 * On iOS and Android the fonts are embedded in the build by the `expo-font` plugin (app.json), so
 * there is nothing to load at runtime. Web loads them in `fonts.web.ts`.
 */
export function useAppFonts() {}
