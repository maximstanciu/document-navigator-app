import { render, screen, userEvent } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';

import { Button } from './button';

describe('Button', () => {
  it('calls onPress when pressed', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced as disabled and ignores presses when disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Save' });
    await user.press(button);

    expect(button).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('takes an accessible name that says more than the visible label', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <Button
        label="Restore"
        aria-label="Restore the deadline of Oct 31"
        variant="plain"
        onPress={onPress}
      />
    );

    await user.press(screen.getByRole('button', { name: 'Restore the deadline of Oct 31' }));

    expect(screen.getByText('Restore')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a destructive action in the high-risk color, not by color alone', async () => {
    await render(<Button label="Delete" variant="destructive" onPress={jest.fn()} />);

    expect(screen.getByText('Delete')).toHaveStyle({ color: Colors.light.riskHigh });
  });
});
