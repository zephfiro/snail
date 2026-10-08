import type { Suspect, SuspectCategory } from './suspects';

export interface InvestigationStep {
  title: string;
  instructions: string;
  observation: string;
  reversal?: string;
}
export interface InvestigationPlan {
  id: string;
  title: string;
  subject: string;
  hypothesis: string;
  evidenceRequired: string;
  limitations: string[];
  steps: readonly InvestigationStep[];
}

const genericSteps: Record<SuspectCategory, InvestigationStep[]> = {
  'extension-host': [
    {title:'Reproduce the issue',instructions:'Repeat the same slow editor action and note the time and environment.',observation:'Latency, workspace, load at the time.'},
    {title:'Inspect the host',instructions:'Use Help: Open Process Explorer and Developer: Show Running Extensions to examine supported observations.',observation:'Aggregate process load; do not infer per-extension usage.'},
    {title:'Test safely',instructions:'If a particular extension is implicated by independent evidence, use Extension Bisect manually.',observation:'Whether slowness reproduces with that extension disabled.',reversal:'Restore disabled extensions after the experiment.'}
  ],
  watcher: [
    {title:'Review exclusions',instructions:'Inspect files.watcherExclude and search.exclude; do not treat candidate directory names as measured file activity.',observation:'Folder names, existing ignore patterns, tooling requirements.'},
    {title:'Test one setting',instructions:'Back up settings and adjust a single exclusion. Repeat the same slow action.',observation:'Repeatable effect, if any.',reversal:'Restore the previous setting.'}
  ],
  configuration: [
    {title:'Inspect settings',instructions:'Review relevant workspace/user settings with attention to scope and inherited defaults.',observation:'Exact effective setting and expected behavior.'},
    {title:'Compare carefully',instructions:'Change only one reversible setting, with consent, and repeat the same operation.',observation:'Comparable before/after observations.',reversal:'Restore the original value.'}
  ],
  'language-server': [],
  extension: [
    {title:'Form a specific hypothesis',instructions:'Identify independent evidence for an extension. Active status alone is not evidence of high CPU.',observation:'Reproducible workload or supported profile.'},
    {title:'Manual A/B test',instructions:'Use VS Code Extension Bisect or disable the suspected extension manually, then reload.',observation:'Repeat the same operation with consistent conditions.',reversal:'Re-enable extensions after testing.'}
  ],
  workspace: [
    {title:'Identify costly operations',instructions:'Use the same navigation, search or indexing action in a representative workspace.',observation:'Operation duration, workspace size and active tools.'},
    {title:'Compare reduced scope',instructions:'Temporarily open a smaller subset or isolated folder and repeat.',observation:'Reproducible difference and confounding changes.',reversal:'Reopen the original workspace.'}
  ]
};
export const TYPESCRIPT_INVESTIGATION: InvestigationPlan = {
  id: 'typescript-language-server',
  title: 'Investigate the TypeScript Language Server (tsserver)',
  subject: 'typescript_language_server',
  hypothesis: 'TypeScript project indexing or plugins may contribute to slow TypeScript editor actions.',
  evidenceRequired: 'Reproducible autocomplete, hover, navigation or file-open latency; independently observed tsserver process/log evidence when available.',
  limitations: [
    'The Snail Extension Host CPU sample is NOT tsserver CPU.',
    'VS Code does not expose reliable per-language-server CPU/RAM through the public extension API.',
    'Logs may contain private paths and code; never export them automatically.'
  ],
  steps: [
    {title:'1. Define an editor operation',instructions:'Choose autocomplete, hover, Go to Definition or opening a TS/TSX file; keep the same file and action for the experiment.',observation:'Manually record at least three latency values in milliseconds and whether the slowdown reproduces.'},
    {title:'2. Identify the correct process',instructions:'Open Help: Open Process Explorer. Identify tsserver separately from Extension Host; if unavailable, mark process metrics unavailable.',observation:'Any independently observed process identity and measurement window, not the Snail host CPU.'},
    {title:'3. Review TypeScript project scope',instructions:'Use TypeScript: Go to Project Configuration; review tsconfig/jsconfig files/include/exclude, project references and generated folders. Directory presence alone does not prove indexing.',observation:'Document specific candidate configuration and alternative explanations.'},
    {title:'4. Optional server logs',instructions:'If necessary, enable TypeScript logging and use TypeScript: Open TS Server Log. Read locally; never share raw logs or code without reviewing their content.',observation:'Relevant operations or project-loading events; keep sensitive paths private.'},
    {title:'5. Single-variable intervention',instructions:'Change one reversible configuration or temporarily disable a plugin manually, with a backup. You may also restart the TypeScript server as a separate experiment.',observation:'Repeat the exact operation at least three times with similar workload.',reversal:'Restore the prior configuration or re-enable the plugin after testing.'},
    {title:'6. Compare and challenge',instructions:'Use Snail: Record Baseline and Snail: Record Comparison. A single self-reported improvement does not confirm causation.',observation:'Context-matched repetitions, potential confounders and whether the behavior reproduced.'}
  ]
};

export function planForSuspect(suspect: Pick<Suspect, 'id'|'title'|'hypothesis'|'category'|'nextStep'>): InvestigationPlan {
  if (suspect.category === 'language-server' || suspect.id === TYPESCRIPT_INVESTIGATION.id) return TYPESCRIPT_INVESTIGATION;
  return {
    id: suspect.id, title: 'Investigate: ' + suspect.title,
    subject: suspect.category, hypothesis: suspect.hypothesis,
    evidenceRequired: 'Independent, repeatable measurements relevant to this specific suspect.',
    limitations: ['A single snapshot cannot demonstrate causality.', 'No settings or extensions are changed automatically.'],
    steps: genericSteps[suspect.category] || genericSteps.workspace
  };
}
