import type { DocumentDetail } from './types';

/** Local sample data, served while `EXPO_PUBLIC_API_URL` is unset and reused by tests. */
export const documentFixtures: DocumentDetail[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    updatedAt: '2026-10-01T09:30:00.000Z',
    pageCount: 3,
    tags: ['guide'],
    body: 'This screen is rendered from local fixtures. Set EXPO_PUBLIC_API_URL in .env to load documents from your backend instead.',
  },
  {
    id: 'project-structure',
    title: 'Project structure',
    updatedAt: '2026-09-24T14:05:00.000Z',
    pageCount: 5,
    tags: ['guide', 'architecture'],
    body: 'Routes live in src/app and stay thin. Each feature owns its API calls, queries, components and screens under src/features/<name>.',
  },
  {
    id: 'release-checklist',
    title: 'Release checklist',
    updatedAt: '2026-09-12T08:00:00.000Z',
    pageCount: 2,
    tags: ['process'],
    body: 'Run npm run verify, bump the version in app.json, then build with EAS. See the release skill in .claude/skills.',
  },
];
