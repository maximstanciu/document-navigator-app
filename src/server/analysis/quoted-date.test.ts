import { quoteWritesDate } from './quoted-date';

describe('quoteWritesDate', () => {
  it.each([
    ['Bitte zahlen Sie bis zum 01.12.2026.', '2026-12-01'],
    ['Bitte zahlen Sie bis zum 1.12.2026.', '2026-12-01'],
    ['Zahlbar bis 01.12.26 ohne Abzug.', '2026-12-01'],
    ['Gasprüfung bis 01/12/2026 durchführen.', '2026-12-01'],
    ['Due date: 2026-12-01', '2026-12-01'],
    ['Die Schlüssel werden am 01.12. übergeben.', '2026-12-01'],
    ['Bitte zahlen Sie bis zum 1. Dezember 2026.', '2026-12-01'],
    ['bis zum 1. Dez. 2026', '2026-12-01'],
    ['spätestens am 3. März', '2027-03-03'],
    ['Please pay by December 1, 2026.', '2026-12-01'],
    ['Please pay by Dec 1st, 2026.', '2026-12-01'],
    ['on the 1st of December 2026', '2026-12-01'],
    ['Оплатить до 1 декабря 2026 г.', '2026-12-01'],
    ['Сплатити до 1 грудня 2026 року', '2026-12-01'],
    ['Pagar até 1 de dezembro de 2026.', '2026-12-01'],
    ['O pagamento deve ser efetuado até 01/12/2026.', '2026-12-01'],
    ['a reunião é a 3 de março', '2027-03-03'],
    ['data limite: 1 dez. 2026', '2026-12-01'],
    ['Bitte zahlen Sie bis zum 1. Dezember 2026.', '2026-12-01'],
  ])('finds the date in %p', (quote, date) => {
    expect(quoteWritesDate(quote, date)).toBe(true);
  });

  it.each([
    ['a relative deadline', 'Innerhalb von zwei Wochen nach Zustellung.', '2026-12-01'],
    ['another year', 'Bitte zahlen Sie bis zum 01.12.2025.', '2026-12-01'],
    ['another year after the month name', 'bis zum 1. Dezember 2025', '2026-12-01'],
    ['another year after a Portuguese month', 'até 1 de dezembro de 2025', '2026-12-01'],
    ['a working-day period', 'no prazo de 15 dias úteis a contar da notificação', '2026-12-01'],
    ['the English word "out"', 'Pay 15 out of 20 instalments.', '2026-10-15'],
    ['another day', 'Bitte zahlen Sie bis zum 11.12.2026.', '2026-12-01'],
    ['a day inside a longer number', 'Rechnung 101.12.2026', '2026-12-01'],
    ['the US order of day and month', 'Pay by 01/12/2026.', '2026-01-12'],
    ['a decimal amount', 'Betrag: 1.12 EUR', '2026-12-01'],
    ['a month name inside a word', 'Mainz, 1 Mail', '2026-05-01'],
    ['a date not in the calendar', 'bis zum 30.02.2026', '2026-02-30'],
  ])('finds no date in %s', (_case, quote, date) => {
    expect(quoteWritesDate(quote, date)).toBe(false);
  });
});
