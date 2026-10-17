import { handleEvents } from '@/server/spike/spike';

export function GET(request: Request) {
  return handleEvents(request);
}
