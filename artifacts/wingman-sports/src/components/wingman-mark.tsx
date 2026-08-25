import { cn } from '@/lib/utils';
import { WINGMAN_ART_DATA_URI } from '@/lib/wingman-art';

type Props = { className?: string; compact?: boolean; label?: string };

/**
 * The approved Wingman identity from the earlier Replit mockup.
 * Using packaged assets keeps the mark identical in StackBlitz and Replit.
 */
export function WingmanMark({ className, compact = false, label = 'Wingman' }: Props) {
  return (
    <div aria-label={label} role="img" className={cn('wingman-mark', compact && 'wingman-mark--compact', className)}>
      <img src={WINGMAN_ART_DATA_URI} alt="" aria-hidden="true" className="h-full w-full object-cover" />
    </div>
  );
}

/** Hero treatment mirrors the approved red/black broadcast mockup. */
export function WingmanHeroArt() {
  return (
    <div aria-hidden className="wingman-hero-art">
      <div className="wingman-hero-grid" />
      <div className="wingman-hero-halo" />
      <img src={WINGMAN_ART_DATA_URI} alt="" className="wingman-hero-person" />
    </div>
  );
}
