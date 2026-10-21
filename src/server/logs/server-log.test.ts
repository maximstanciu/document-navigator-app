import { consoleServerLog, redactError, reportError } from './server-log';

describe('consoleServerLog', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes one JSON line to console.info, which EAS Hosting keeps', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});

    consoleServerLog({ event: 'upload.end', status: 202, push: true, pages: null });

    expect(info).toHaveBeenCalledWith(
      '{"event":"upload.end","status":202,"push":true,"pages":null}'
    );
  });
});

describe('redactError', () => {
  it('keeps the name and the stack frames, not the message', () => {
    const error = new SyntaxError('Unexpected token in "Мария Иванова, IBAN DE89…"');

    const redacted = redactError(error);

    expect(redacted.name).toBe('SyntaxError');
    expect(redacted.message).toBe('[message redacted]');
    expect(redacted.stack).not.toContain('Иванова');
    expect(redacted.stack?.split('\n')[0]).toBe('SyntaxError: [message redacted]');
    expect(redacted.stack?.split('\n').slice(1)).toEqual(
      error.stack?.split('\n').filter((line) => /^\s+at\s/.test(line))
    );
  });

  it('handles a thrown value that is not an Error', () => {
    expect(redactError('Мария Иванова')).toMatchObject({
      name: 'string',
      message: '[message redacted]',
    });
  });
});

describe('reportError', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes the name and stack frames to stderr, not the message', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    reportError(new TypeError('Cannot read "Мария Иванова"'));

    expect(error).toHaveBeenCalledTimes(1);
    const [written] = error.mock.calls[0];
    expect(written).toMatch(/^TypeError: \[message redacted\]\n\s+at /);
    expect(written).not.toContain('Иванова');
  });
});
