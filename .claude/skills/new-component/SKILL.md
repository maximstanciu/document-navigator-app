---
name: new-component
description: Create a React Native UI component that follows this project's theming, accessibility, and file conventions, with a test. Use when the user asks for a new component, widget, button, card, row, input, or any reusable piece of UI, or to extract UI out of a screen.
argument-hint: '<component-name> [shared|feature:<name>] [what it does]'
---

# New component

## 1. Decide where it lives

| Used by                                     | Location                                       |
| ------------------------------------------- | ---------------------------------------------- |
| One feature                                 | `src/features/<feature>/components/<name>.tsx` |
| Several features                            | `src/components/<name>.tsx`                    |
| Generic primitive (Button, TextField, Card) | `src/components/ui/<name>.tsx`                 |

Start in the feature; promote to `src/components/` only when a second feature needs it. Check `src/components/` and `src/components/ui/` first — reuse beats a near-duplicate.

## 2. Conventions

Reference: `src/components/ui/button.tsx` (primitive) and `src/features/documents/components/document-list-item.tsx` (feature row).

- **Files** kebab-case (`document-card.tsx`); **exports** named PascalCase (`export function DocumentCard`). No default exports outside `src/app/`.
- **Props**: export a `<Name>Props` type when other files need it. Extend RN props (`Omit<PressableProps, 'style'>`) instead of re-declaring them; spread `...rest` last on the root element.
- **Styling**: `StyleSheet.create` at the bottom of the file. Colors only from `useTheme()` or `ThemedText`/`ThemedView` (`themeColor`/`type` props) — never hex literals in components. Spacing from `Spacing`. New colors go into both `light` and `dark` in `src/constants/theme.ts`.
- **Text**: always `ThemedText` with a `type` (`default`, `small`, `smallBold`, `subtitle`, `title`, `link`, `code`). Raw `<Text>` skips theming.
- **Strings**: once task 1.1 lands, visible text and `aria-label`s come from the ru/en dictionaries — components take translated strings or call the translation hook, never hard-code user-facing English. Dates, amounts and plurals via `Intl`.
- **Data**: components get data through props or the feature's query hooks; native capabilities through the feature's adapter. No `fetch`, DB or native module calls in components.
- **Risk and warnings**: risk levels and fraud warnings use the dedicated color tokens (`riskHigh`, `riskMedium`, `riskLow`, `fraudWarning`, each with a `…Background`) **plus** text and an icon — never color alone (DET-10).
- **Privacy**: never `console.log` document content (titles, senders, amounts, quotes).
- **Images**: `expo-image` (`import { Image } from 'expo-image'`), not RN `Image`.
- **Icons**: `expo-symbols` `SymbolView` with `{ ios, android, web }` names.
- **Memoization**: React Compiler is on — don't add `useMemo`/`useCallback`/`memo` by default. Add them only for a measured problem or a third-party API that needs a stable identity.
- **Platform differences**: small ones with `Platform.select`/`process.env.EXPO_OS`; large ones with sibling files `name.tsx` + `name.web.tsx` (or `.ios.tsx`/`.android.tsx`) that export the same API (see `app-tabs.tsx`/`app-tabs.web.tsx`).

## 3. Accessibility (required, not polish)

Use ARIA-style props (RN supports them and the tests query by them):

- Interactive elements: `role` (`button`, `link`, `switch`, `checkbox`, `tab`...) and an `aria-label` when the visible text isn't a complete name.
- State: `aria-disabled`, `aria-selected`, `aria-checked`, `aria-expanded`, `aria-busy` — mirror the real state.
- Touch target ≥ `MinTouchTarget` (44pt) via `minHeight`/`minWidth` or `hitSlop`.
- Decorative images/icons: `aria-hidden` (or `accessible={false}`); meaningful ones get `aria-label`/`alt`.
- Don't convey meaning by color alone; keep text contrast ≥ 4.5:1 (theme tokens already do).

More detail: `accessibility-audit` skill.

## 4. Test

`<name>.test.tsx` next to the component. Query by role and name, interact with `userEvent`, assert with RNTL matchers. Minimum: it renders its content, its interactions call the right callbacks, disabled/selected states are exposed. See `src/components/ui/button.test.tsx` and the `write-tests` skill.

## 5. Finish

Run the `verify` skill. For visual changes, check light **and** dark mode with the `run-app` skill.
