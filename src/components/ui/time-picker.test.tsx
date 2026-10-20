import { render, screen, userEvent } from '@testing-library/react-native';

// The web field: the one Jest renders in screens too, since the native pickers can't run here.
import { TimePicker } from './time-picker.web';

async function renderPicker() {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await render(
    <TimePicker value="09:00" label="Reminder time" onConfirm={onConfirm} onCancel={onCancel} />
  );
  return { onConfirm, onCancel, field: screen.getByLabelText('Reminder time') };
}

describe('TimePicker (web)', () => {
  it('starts from the given time and confirms a new one', async () => {
    const user = userEvent.setup();
    const { onConfirm, field } = await renderPicker();
    expect(field).toHaveDisplayValue('09:00');

    await user.clear(field);
    await user.type(field, '18:30');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm).toHaveBeenCalledWith('18:30');
  });

  it('refuses a time that is not on the clock and says how to write it', async () => {
    const user = userEvent.setup();
    const { onConfirm, field } = await renderPicker();

    await user.clear(field);
    await user.type(field, '24:00');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/HH:MM/);
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
