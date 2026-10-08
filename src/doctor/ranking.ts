import type { Suspect, SuspectPriority } from './suspects';
const ORDER: Record<SuspectPriority, number> = {
  investigate_first: 0, possible: 1, insufficient_evidence: 2
};
/** Only independent, measurable support justifies a higher priority.
 * Do NOT convert aggregate host CPU into an extension-specific score. */
export function rankSuspects(suspects: readonly Suspect[]): Suspect[] {
  const classified = suspects.map(suspect => {
    const measured = suspect.evidence.filter(item => item.source === 'measured_by_snail');
    const origins = new Set(measured.map(item => item.origin));
    const priority: SuspectPriority =
      suspect.status === 'insufficient_evidence' ? 'insufficient_evidence' :
      measured.length > 0 && origins.size >= 2 ? 'investigate_first' :
      'possible';
    const priorityReason = priority === 'investigate_first'
      ? 'At least two independent measured observations; investigate first, not confirmed.'
      : priority === 'possible'
        ? suspect.priorityReason
        : 'Missing evidence to estimate impact or priority.';
    return { ...suspect, priority, priorityReason };
  });
  return classified.sort((a,b) => ORDER[a.priority]-ORDER[b.priority] ||
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
