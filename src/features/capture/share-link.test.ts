import { redirectShareLink, SHARED_FILES_PATH } from './share-link';

describe('redirectShareLink (CAP-11)', () => {
  it('sends the link of a share to the capture route that takes the files, keyed by the share', () => {
    const shared = `${SHARED_FILES_PATH}?share=7`;
    expect(redirectShareLink('docnavigator://expo-sharing', '7')).toBe(shared);
    expect(redirectShareLink('docnavigator://expo-sharing/', '7')).toBe(shared);
    expect(redirectShareLink('exp+docnavigator://expo-sharing?x=1', '7')).toBe(shared);
  });

  it('gives each share its own key', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    expect(redirectShareLink('docnavigator://expo-sharing')).toBe(
      `${SHARED_FILES_PATH}?share=1000`
    );
    expect(redirectShareLink('docnavigator://expo-sharing')).toBe(
      `${SHARED_FILES_PATH}?share=2000`
    );
  });

  it('leaves every other link as it is', () => {
    expect(redirectShareLink('docnavigator://documents/abc')).toBe('docnavigator://documents/abc');
    expect(redirectShareLink('docnavigator://expo-sharing-else')).toBe(
      'docnavigator://expo-sharing-else'
    );
    expect(redirectShareLink('/capture')).toBe('/capture');
    expect(redirectShareLink('')).toBe('');
  });
});
