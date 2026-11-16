import { render, screen, userEvent } from '@testing-library/react-native';

// The web fields: the ones Jest renders in screens too, since the native pickers can't run here.
import { DatePicker, TimePicker } from './date-time-picker.web';

async function renderDatePicker() {
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
    const { onConfirm, field } = await renderDatePicker();
    expect(field).toHaveDisplayValue('2026-10-31');

    await user.clear(field);
    await user.type(field, '2026-11-14');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm).toHaveBeenCalledWith('2026-11-14');
  });

  it('refuses a date that is not in the calendar and says how to write it', async () => {
    const user = userEvent.setup();
    const { onConfirm, field } = await renderDatePicker();

    await user.clear(field);
    await user.type(field, '2026-02-30');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/YYYY-MM-DD/);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = await renderDatePicker();

    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

async function renderTimePicker() {
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
    const { onConfirm, field } = await renderTimePicker();
    expect(field).toHaveDisplayValue('09:00');

    await user.clear(field);
    await user.type(field, '18:30');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm).toHaveBeenCalledWith('18:30');
  });

  it('refuses a time that is not on the clock and says how to write it', async () => {
    const user = userEvent.setup();
    const { onConfirm, field } = await renderTimePicker();

    await user.clear(field);
    await user.type(field, '24:00');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/HH:MM/);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = await renderTimePicker();

    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
