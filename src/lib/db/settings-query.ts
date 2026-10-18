import { queryOptions } from '@tanstack/react-query';

import { dbKeys, localQueryDefaults } from './query-keys';
import { getRepositories } from './repositories';

/** App settings (language, reminder defaults, consent…), read by several features. */
export function settingsQuery() {
  return queryOptions({
    queryKey: dbKeys.settings.all(),
    queryFn: () => getRepositories().settings.get(),
    ...localQueryDefaults,
  });
}
