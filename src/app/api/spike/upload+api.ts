import { handleUpload } from '@/server/spike/spike';

export function POST(request: Request) {
  return handleUpload(request);
}
