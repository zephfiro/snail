export { detectSuspects, DEFAULT_SUSPECT_RULES } from './suspects';
export { rankSuspects } from './ranking';
export type { Suspect, SuspectEvidence, SuspectRule, SuspectCategory, SuspectPriority } from './suspects';
export { planForSuspect, TYPESCRIPT_INVESTIGATION } from './investigation';
export { renderInvestigation } from './investigation-view';
export { median, validObservation, compareTrial, evaluateExperiment } from './experiments';
export { renderExperimentVerdict } from './experiment-view';
export type { Observation, ExperimentTrial, ExperimentVerdict, EnvironmentSignature } from './experiments';
