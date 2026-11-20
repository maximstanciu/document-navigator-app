import { render, screen } from '@testing-library/react-native';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('is announced as a busy progress bar with its name', async () => {
    await render(<ProgressBar aria-label="Analyzing the document…" />);

    const bar = screen.getByRole('progressbar', { name: 'Analyzing the document…' });
    expect(bar).toBeBusy();
  });

  it('tells the share done when it is known', async () => {
    await render(<ProgressBar aria-label="Analyzing" value={0.374} />);

    const bar = screen.getByRole('progressbar', { name: 'Analyzing' });
    expect(bar).toHaveAccessibilityValue({ min: 0, max: 100, now: 37 });
    expect(bar).toBeBusy();
  });

  it('keeps a share within the track', async () => {
    await render(<ProgressBar aria-label="Analyzing" value={1.2} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 100 });

    await render(<ProgressBar aria-label="Analyzing" value={-0.1} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 0 });
  });

  it('has no value while the share is not known', async () => {
    await render(<ProgressBar aria-label="Analyzing" value={null} />);

    expect(screen.getByRole('progressbar')).not.toHaveProp('aria-valuenow');
  });

  it('stays out of the accessibility tree when the text next to it already says it', async () => {
    await render(<ProgressBar aria-hidden />);

    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { includeHiddenElements: true })).not.toBeVisible();
  });
});
