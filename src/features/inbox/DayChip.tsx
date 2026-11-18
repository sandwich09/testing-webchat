import { testIds } from '@/common/test-ids';

/** Date capsule between days of the thread (ui-screens 5.3). `label` comes from `formatDayChip`. */
export function DayChip({ label }: { label: string }) {
  return (
    <div className="my-4 flex justify-center">
      <span
        data-testid={testIds.dayChip}
        className="rounded-full bg-fg/60 px-2.5 py-0.5 text-meta text-white"
      >
        {label}
      </span>
    </div>
  );
}
