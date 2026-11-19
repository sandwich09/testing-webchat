import { copy as commonCopy } from '@/common/common.constants';
import { AVATAR_LIST } from '@/common/layout.constants';
import { Skeleton } from '@/common/ui/skeleton';

type ContactListSkeletonProps = {
  /** Number of placeholder rows. The first load shows 8, loading the next page shows 2. */
  rows?: number;
  testId: string;
};

/** Placeholder rows: a 44px circle and two bars of 60% and 85% (ui-screens 4.3). */
export function ContactListSkeleton({ rows = 8, testId }: ContactListSkeletonProps) {
  return (
    <div data-testid={testId} role="status" aria-busy="true">
      <span className="sr-only">{commonCopy.loading}</span>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex min-h-[72px] items-center gap-3 px-4 py-3 medium:min-h-[68px]"
          >
            <Skeleton
              className="shrink-0 rounded-full"
              style={{ width: AVATAR_LIST, height: AVATAR_LIST }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3.5 w-[85%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
