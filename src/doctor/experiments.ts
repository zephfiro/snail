export type EditorOperation = 'autocomplete' | 'hover' | 'goToDefinition' | 'openFile';
export type Verdict = 'insufficient_evidence' | 'suspected' | 'likely' | 'verified_by_experiment';

export interface EnvironmentSignature {
  vscodeVersion: string;
  remote: boolean;
  workspaceFolderCount: number;
}
export interface Observation {
  schemaVersion: 1;
  subject: 'typescript_language_server';
  operation: EditorOperation;
  timestamp: string;
  environment: EnvironmentSignature;
  source: 'manual_observation' | 'measured_by_snail';
  measurementsMs: readonly number[];
}
export interface ExperimentTrial {
  baseline: Observation;
  comparison: Observation;
  singleChange: boolean;
  reverted: boolean;
}
export interface TrialResult {
  comparable: boolean;
  reason: string;
  baselineMedianMs?: number;
  comparisonMedianMs?: number;
  changePercent?: number;
}
export interface ExperimentVerdict {
  status: Verdict;
  explanation: string;
  trialResults: TrialResult[];
}

export function validObservation(value: Observation): boolean {
  return value.schemaVersion === 1 && value.subject === 'typescript_language_server' &&
    value.measurementsMs.length >= 3 && value.measurementsMs.length <= 20 &&
    value.measurementsMs.every(n => Number.isFinite(n) && n > 0 && n < 3600000) &&
    Boolean(value.timestamp) && Boolean(value.operation) &&
    Number.isSafeInteger(value.environment.workspaceFolderCount);
}
export function median(values: readonly number[]): number {
  if (!values.length) throw new Error('No values');
  const sorted = [...values].sort((a, b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
export function compareTrial(trial: ExperimentTrial): TrialResult {
  const before=trial.baseline, after=trial.comparison;
  if (!validObservation(before) || !validObservation(after)) {
    return {comparable:false,reason:'One or both observations are invalid or have fewer than three repetitions.'};
  }
  if (before.subject !== after.subject || before.operation !== after.operation ||
      before.source !== after.source ||
      before.environment.vscodeVersion !== after.environment.vscodeVersion ||
      before.environment.remote !== after.environment.remote ||
      before.environment.workspaceFolderCount !== after.environment.workspaceFolderCount) {
    return {comparable:false,reason:'Workload, source or environment differs; observations cannot be compared.'};
  }
  if (!trial.singleChange) {
    return {comparable:false,reason:'Multiple variables changed; this experiment cannot isolate a cause.'};
  }
  const baselineMedianMs=median(before.measurementsMs);
  const comparisonMedianMs=median(after.measurementsMs);
  const changePercent=Math.round(((comparisonMedianMs - baselineMedianMs)/baselineMedianMs)*1000)/10;
  return {
    comparable:true,
    reason:'Matched manual/observed samples. Other workload effects, caches and plugins remain potential confounders.',
    baselineMedianMs,comparisonMedianMs,changePercent
  };
}
/** Restrictive verdict: manual observations cannot yield 'verified by experiment'. */
export function evaluateExperiment(trials: readonly ExperimentTrial[]): ExperimentVerdict {
  const results=trials.map(compareTrial);
  const comparable=results.map((result,index)=>({result,trial:trials[index]})).filter(x=>x.result.comparable);
  if (!comparable.length) return {
    status:'insufficient_evidence',explanation:'No valid comparable trial. Keep the same operation, VS Code environment and one reversible change.',trialResults:results
  };
  const improved=comparable.filter(x=>x.result.changePercent!==undefined && x.result.changePercent<=-20);
  if (improved.length<1) return {
    status:'insufficient_evidence',explanation:'No consistent improvement of at least 20% was observed. This hypothesis remains unproven.',trialResults:results
  };
  if (comparable.length<2 || improved.length!==comparable.length || comparable.some(x=>!x.trial.reverted)) {
    return {
      status:'suspected',explanation:'A difference was observed, but a single or uncontrolled comparison is not proof of causation. Repeat with reversal under similar conditions.',trialResults:results
    };
  }
  const independent=comparable.every(x=>x.trial.baseline.source==='measured_by_snail');
  return {
    status: independent?'verified_by_experiment':'likely',
    explanation:independent
      ? 'Repeated controlled, reverted, instrumented comparisons support this hypothesis; correlation still has limitations.'
      : 'Repeated comparable self-reported observations support this hypothesis; manual timings alone cannot confirm causation.',
    trialResults:results
  };
}
