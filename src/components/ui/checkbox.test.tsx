import { render, screen, userEvent } from '@testing-library/react-native';

import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('exposes its state and reports the opposite one when pressed', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<Checkbox label="Pay the invoice" checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Pay the invoice' });
    expect(checkbox).not.toBeChecked();
    await user.press(checkbox);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('unchecks a checked box', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<Checkbox label="Pay the invoice" checked onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Pay the invoice' });
    expect(checkbox).toBeChecked();
    await user.press(checkbox);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('ignores presses when disabled', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<Checkbox label="Pay" checked={false} onChange={onChange} disabled />);

    await user.press(screen.getByRole('checkbox', { name: 'Pay' }));

    expect(screen.getByRole('checkbox', { name: 'Pay' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
