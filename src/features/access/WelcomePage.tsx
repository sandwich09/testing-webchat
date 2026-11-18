import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import { copy } from './access.constants';
import { AccessForm } from './AccessForm';
import styles from './welcome.module.css';

export function WelcomePage() {
  return (
    <main className={styles.cover} data-testid={testIds.welcomeCover}>
      <span aria-hidden="true" className={cn(styles.circle, styles.circleA)} />
      <span aria-hidden="true" className={cn(styles.circle, styles.circleB)} />
      <span aria-hidden="true" className={cn(styles.circle, styles.circleC)} />
      <span aria-hidden="true" className={cn(styles.circle, styles.circleD)} />
      <div className={styles.card}>
        <span className={styles.badge}>{copy.cover.badge}</span>
        <h1 className={styles.title}>
          {copy.cover.title}
          <span className={styles.subtitle}>
            <span aria-hidden="true" className={cn(styles.hairline, styles.hairlineLeft)} />
            <span className={styles.subtitleText}>{copy.cover.subtitle}</span>
            <span aria-hidden="true" className={cn(styles.hairline, styles.hairlineRight)} />
          </span>
        </h1>
        <AccessForm />
      </div>
    </main>
  );
}
