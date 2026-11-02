import { render, screen } from '@testing-library/react-native';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('is announced as a busy progress bar with its name', async () => {
    await render(<ProgressBar aria-label="Analyzing the document…" />);

    const bar = screen.getByRole('progressbar', { name: 'Analyzing the document…' });
    expect(bar).toBeBusy();
  });

  it('stays out of the accessibility tree when the text next to it already says it', async () => {
    await render(<ProgressBar aria-hidden />);

    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { includeHiddenElements: true })).not.toBeVisible();
  });
});
