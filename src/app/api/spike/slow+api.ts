import { handleSlow } from '@/server/spike/spike';

export function GET(request: Request) {
  return handleSlow(request);
}

export function POST(request: Request) {
  return handleSlow(request);
}
