/**
 * Animated spinner for in-progress status values.
 * Uses Date.now() so it's frame-agnostic — just call frame() each render.
 * RenderLoop.enableAnimation() must be active for smooth updates.
 */
// ASCII-only frames — EAW-ambiguous chars (◌◎●) are 2-wide in CJK terminals
const FRAMES = ['|', '/', '-', '\\'] as const;

const ANIMATED_STATUSES = new Set(['EXECUTING', 'WAITING_EXECUTION']);

export class SpinnerBadge {
  /** Current spinner character based on wall clock. */
  static frame(intervalMs = 250): string {
    return FRAMES[Math.floor(Date.now() / intervalMs) % FRAMES.length] ?? '|';
  }

  /** Returns true if this status value should show a spinner. */
  static isAnimated(status: string): boolean {
    return ANIMATED_STATUSES.has(status);
  }

  /**
   * Formats a status string. EXECUTING → "◌ EXECUTI" (width-aware).
   * Other statuses pass through unchanged.
   */
  static format(status: string, maxWidth?: number): string {
    if (!SpinnerBadge.isAnimated(status)) return status;
    const spinner = SpinnerBadge.frame();
    const label = `${spinner} ${status}`;
    if (!maxWidth || label.length <= maxWidth) return label;
    // Reserve 1 char for ellipsis so the truncation is visible
    return label.slice(0, maxWidth - 1) + '…';
  }
}
