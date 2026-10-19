import { useEffect, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Spacing } from '@/constants/theme';

import {
  autoScrollStep,
  gridHeight,
  gridMetrics,
  moveItem,
  slotAt,
  slotOrigin,
  type GridMetrics,
  type Point,
} from '../page-grid-layout';
import type { CapturedPage } from '../types';
import { PageThumbnail } from './page-thumbnail';

const COLUMNS = 3;
const GAP = Spacing.two;
/** How long a page is held before it moves with the finger; a swipe before that scrolls the list. */
const HOLD_TO_DRAG_MS = 300;
/** Near this distance from an edge of the visible area a dragged page scrolls the list… */
const AUTO_SCROLL_EDGE = 80;
/** …by up to this many points a frame. */
const AUTO_SCROLL_MAX_STEP = 12;
const SETTLE_MS = 200;

type PageGridProps = {
  pages: readonly CapturedPage[];
  /** Shown above the pages and scrolled with them. */
  header?: ReactNode;
  /** Shown in place of the pages when there are none. */
  empty?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Without a handler pages stay in place (e.g. while pages are prepared or saved). */
  onMove?: (from: number, to: number) => void;
  /** Without a handler pages can't be removed. */
  onRemove?: (index: number) => void;
};

/** Shared by the pages of the grid while one of them is dragged. */
type Drag = {
  /** Page URIs in the order they are shown; ahead of `pages` while a page is dragged. */
  order: SharedValue<string[]>;
  /** The page that follows the finger. */
  active: SharedValue<string | null>;
  /** The page dragged last: stays above the others while it settles into its place. */
  lifted: SharedValue<string | null>;
  /** Top-left corner of the dragged page in the grid. */
  position: SharedValue<Point>;
  start: (key: string, touch: Point) => void;
  update: (translation: Point) => void;
  end: (key: string) => void;
};

/**
 * The pages of the document being added, three in a row (CAP-5). Holding a page lifts it, then it
 * follows the finger and the others make room; near an edge the list scrolls (CAP-6). Screen
 * reader users move a page with the actions of PageThumbnail instead.
 */
export function PageGrid({
  pages,
  header,
  empty,
  contentContainerStyle,
  onMove,
  onRemove,
}: PageGridProps) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const grid = gridMetrics(width, COLUMNS, GAP);
  const count = pages.length;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Reanimated writes the offset into this value as the list scrolls.
  const scrollOffset = useSharedValue(0);
  useScrollOffset(scrollRef, scrollOffset);
  const viewportHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const gridTop = useSharedValue(0);

  const order = useSharedValue(pages.map((page) => page.uri));
  const active = useSharedValue<string | null>(null);
  const lifted = useSharedValue<string | null>(null);
  const position = useSharedValue<Point>({ x: 0, y: 0 });
  const origin = useSharedValue<Point>({ x: 0, y: 0 });
  const touch = useSharedValue<Point>({ x: 0, y: 0 });
  const translation = useSharedValue<Point>({ x: 0, y: 0 });
  const scrollAtStart = useSharedValue(0);

  // Pages added, removed or moved by other means: the grid follows the new order.
  useEffect(() => {
    order.set(pages.map((page) => page.uri));
  }, [order, pages]);

  /** Places the dragged page under the finger and makes room for it where it is. */
  function follow() {
    'worklet';
    const key = active.get();
    if (key === null) return;
    const shift = translation.get();
    const next = {
      x: origin.get().x + shift.x,
      y: origin.get().y + shift.y + scrollOffset.get() - scrollAtStart.get(),
    };
    position.set(next);
    const finger = { x: next.x + touch.get().x, y: next.y + touch.get().y };
    const from = order.get().indexOf(key);
    const to = slotAt(finger, count, grid);
    if (from !== -1 && from !== to) order.set(moveItem(order.get(), from, to));
  }

  const autoScroll = useFrameCallback(() => {
    if (active.get() === null) return;
    const fingerY = gridTop.get() + position.get().y + touch.get().y - scrollOffset.get();
    const step = autoScrollStep(
      fingerY,
      viewportHeight.get(),
      AUTO_SCROLL_EDGE,
      AUTO_SCROLL_MAX_STEP
    );
    const maxOffset = Math.max(0, contentHeight.get() - viewportHeight.get());
    const offset = Math.min(Math.max(scrollOffset.get() + step, 0), maxOffset);
    if (offset === scrollOffset.get()) return;
    scrollTo(scrollRef, 0, offset, false);
    follow();
  }, false);

  function onDragChange(on: boolean) {
    setDragging(on);
    autoScroll.setActive(on);
  }

  function drop(key: string, to: number) {
    const from = pages.findIndex((page) => page.uri === key);
    if (from !== -1 && from !== to) onMove?.(from, to);
  }

  const drag: Drag = {
    order,
    active,
    lifted,
    position,
    start: (key, at) => {
      'worklet';
      const slot = order.get().indexOf(key);
      if (slot === -1) return;
      origin.set(slotOrigin(slot, grid));
      position.set(slotOrigin(slot, grid));
      touch.set(at);
      translation.set({ x: 0, y: 0 });
      scrollAtStart.set(scrollOffset.get());
      active.set(key);
      lifted.set(key);
      scheduleOnRN(onDragChange, true);
    },
    update: (shift) => {
      'worklet';
      translation.set(shift);
      follow();
    },
    end: (key) => {
      'worklet';
      if (active.get() !== key) return;
      active.set(null);
      scheduleOnRN(onDragChange, false);
      scheduleOnRN(drop, key, order.get().indexOf(key));
    },
  };

  function onGridLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
    gridTop.set(event.nativeEvent.layout.y);
  }

  return (
    <Animated.ScrollView
      ref={scrollRef}
      scrollEnabled={!dragging}
      contentInsetAdjustmentBehavior="automatic"
      onLayout={(event) => viewportHeight.set(event.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => contentHeight.set(height)}
      contentContainerStyle={contentContainerStyle}>
      {header}
      {count === 0 ? (
        empty
      ) : (
        <View onLayout={onGridLayout} style={{ height: gridHeight(count, grid) }}>
          {pages.map((page, index) => (
            <SortablePage
              key={page.uri}
              page={page}
              index={index}
              count={count}
              grid={grid}
              drag={drag}
              onMove={onMove && count > 1 ? (offset) => onMove(index, index + offset) : undefined}
              onRemove={onRemove && (() => onRemove(index))}
            />
          ))}
        </View>
      )}
    </Animated.ScrollView>
  );
}

type SortablePageProps = {
  page: CapturedPage;
  index: number;
  count: number;
  grid: GridMetrics;
  drag: Drag;
  /** Without a handler the page can't be dragged or moved by the screen reader actions. */
  onMove?: (offset: -1 | 1) => void;
  onRemove?: () => void;
};

/** A page in its cell: slides to its new place when the order changes, follows the finger when held. */
function SortablePage({ page, index, count, grid, drag, onMove, onRemove }: SortablePageProps) {
  const key = page.uri;
  const x = useSharedValue(slotOrigin(index, grid).x);
  const y = useSharedValue(slotOrigin(index, grid).y);

  useAnimatedReaction(
    () => {
      const slot = drag.order.get().indexOf(key);
      return { ...slotOrigin(slot === -1 ? index : slot, grid), size: grid.cellWidth };
    },
    (target, previous) => {
      // The dragged page follows the finger and settles when it is let go.
      if (drag.active.get() === key) return;
      // The first layout or a new width (rotation) moves pages at once; a new order, smoothly.
      if (previous === null || target.size !== previous.size) {
        x.set(target.x);
        y.set(target.y);
      } else if (target.x !== previous.x || target.y !== previous.y) {
        x.set(withTiming(target.x, { duration: SETTLE_MS }));
        y.set(withTiming(target.y, { duration: SETTLE_MS }));
      }
    }
  );

  const pan = usePanGesture({
    enabled: onMove !== undefined,
    activateAfterLongPress: HOLD_TO_DRAG_MS,
    testID: `drag-page-${key}`,
    onActivate: (event) => drag.start(key, { x: event.x, y: event.y }),
    onUpdate: (event) => drag.update({ x: event.translationX, y: event.translationY }),
    onDeactivate: (event) => {
      if (drag.active.get() !== key) return;
      // The finger may lift away from where the last move left it.
      drag.update({ x: event.translationX, y: event.translationY });
      const from = drag.position.get();
      const slot = drag.order.get().indexOf(key);
      const target = slotOrigin(slot === -1 ? index : slot, grid);
      x.set(from.x);
      y.set(from.y);
      x.set(withTiming(target.x, { duration: SETTLE_MS }));
      y.set(withTiming(target.y, { duration: SETTLE_MS }));
      drag.end(key);
    },
  });

  // A page rests where `left` and `top` put it: Android finds it there for TalkBack, which ignores
  // transforms. Only the dragged page is shifted to the finger with a transform.
  const style = useAnimatedStyle(() => {
    const dragged = drag.active.get() === key;
    const shift = dragged
      ? { x: drag.position.get().x - x.get(), y: drag.position.get().y - y.get() }
      : { x: 0, y: 0 };
    return {
      left: x.get(),
      top: y.get(),
      zIndex: drag.lifted.get() === key ? 1 : 0,
      opacity: dragged ? 0.9 : 1,
      transform: [{ translateX: shift.x }, { translateY: shift.y }, { scale: dragged ? 1.05 : 1 }],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.cell, { width: grid.cellWidth, height: grid.cellHeight }, style]}>
        <PageThumbnail
          uri={page.uri}
          number={index + 1}
          count={count}
          onMove={onMove}
          onRemove={onRemove}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
  },
});
