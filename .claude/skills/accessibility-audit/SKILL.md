---
name: accessibility-audit
description: Audit and fix accessibility in React Native screens and components — screen reader labels and roles, focus order, touch target size, Dynamic Type/font scaling, color contrast, reduced motion. Use when the user asks about accessibility, a11y, VoiceOver, TalkBack, screen readers, or before shipping a new screen.
argument-hint: "[screen, component, or 'all']"
---

# Accessibility audit

Scope: the files the user named, or every screen in `src/features/*/screens/` for "all". Read each component tree top to bottom, check the list below, fix what you can, and report the rest.

## Checklist

**Names and roles** (screen reader announces "<name>, <role>")

- Every `Pressable`/touchable has `role` (`button`, `link`, `switch`, `checkbox`, `radio`, `tab`, `menuitem`...) and an accessible name: its visible text, or `aria-label` when the text is missing/insufficient (icon-only buttons, rows combining title + metadata — see `document-list-item.tsx`).
- Headings have `role="heading"`. Error messages that appear dynamically have `role="alert"`.
- Images: meaningful → `alt`/`aria-label`; decorative → `aria-hidden`.
- `TextInput`: visible label linked via `aria-labelledby` (Android) or `aria-label`; `placeholder` alone is not a label.

**State**

- Reflect real state with `aria-disabled`, `aria-selected`, `aria-checked`, `aria-expanded`, `aria-busy`. A visually disabled button that's still pressable, or vice versa, is a bug.
- Loading regions: `aria-busy` (see `LoadingState`).

**Grouping and order**

- Group a row's parts into one focus stop when they're one action (the `Pressable` wrapping the row). Don't make every `Text` separately focusable.
- Reading order follows visual order; avoid `position: 'absolute'` tricks that reorder focus. Modals trap focus (`aria-modal` on iOS) and return it on close.

**Touch targets**

- ≥ 44×44pt (`MinTouchTarget`), via size or `hitSlop`. Adjacent targets don't overlap.

**Text and color**

- Text scales with system font size: no fixed `height` on text containers; test with the largest accessibility size. Use `maxFontSizeMultiplier` only for space-critical UI (tab labels), never body text.
- Contrast ≥ 4.5:1 for body text, 3:1 for large text and UI glyphs, in **both** themes. Use theme tokens; if you add colors to `src/constants/theme.ts`, check contrast for light and dark.
- Never convey state by color alone — add text or an icon. This includes risk levels and fraud warnings (DET-10, §8.4): VoiceOver/TalkBack must read the level as text.
- Labels are localized like visible text (ru/en dictionaries after task 1.1); check that Russian strings don't truncate at large font sizes.

**Motion**

- Respect reduced motion: `useReducedMotion()` from `react-native-reanimated` (or `AccessibilityInfo.isReduceMotionEnabled()`), skip or shorten non-essential animations.

## Verify

- **Tests**: query by role and name — if `getByRole('button', { name: 'Delete document' })` can't find it, neither can a screen reader. Add `toHaveAccessibleName`, `toBeDisabled`, `toBeSelected` assertions for fixed issues (`write-tests` skill).
- **Lint**: `npm run lint`.
- **Manual** (tell the user if you can't do this): VoiceOver (iOS) / TalkBack (Android) swipe-through of the screen; Accessibility Inspector (Xcode) or Accessibility Scanner (Android); largest Dynamic Type; dark mode.

## Report

List issues as `file:line — problem — fix applied / suggested`, grouped by severity: blocks use (no name, unreachable, trapped focus) → hard to use (small targets, low contrast) → polish.
