import { render, screen, userEvent } from '@testing-library/react-native';

// The web field: the one Jest renders in screens too, since the native pickers can't run here.
import { DatePicker } from './date-picker.web';

async function renderPicker() {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await render(
    <DatePicker value="2026-10-31" label="New date" onConfirm={onConfirm} onCancel={onCancel} />
  );
  return { onConfirm, onCancel, field: screen.getByLabelText('New date') };
}

describe('DatePicker (web)', () => {
  it('starts from the given date and confirms a new one', async () => {
    const user = userEvent.setup();
    const { onConfirm, field } = await renderPicker();
    expect(field).toHaveDisplayValue('2026-10-31');

    await user.clear(field);
    await user.type(field, '2026-11-14');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm).toHaveBeenCalledWith('2026-11-14');
  });

  it('refuses a date that is not in the calendar and says how to write it', async () => {
    const user = userEvent.setup();
    const { onConfirm, field } = await renderPicker();

    await user.clear(field);
    await user.type(field, '2026-02-30');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/YYYY-MM-DD/);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = await renderPicker();

    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
