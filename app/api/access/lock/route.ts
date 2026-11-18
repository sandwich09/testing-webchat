import { accessClearedResponse, withRoute } from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute({ route: '/api/access/lock', access: 'cookie' }, () =>
  accessClearedResponse(),
);
