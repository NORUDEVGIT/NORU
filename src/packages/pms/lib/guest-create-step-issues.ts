export type CreateFieldIssue<Step extends string = string> = {
  key: string;
  message: string;
  step: Step;
};

export function createStepTitle(steps: readonly { id: string; title: string }[], id: string): string {
  return steps.find((step) => step.id === id)?.title ?? id;
}

export function formatCreateIssuesByStep<Step extends string>(
  issues: CreateFieldIssue<Step>[],
  steps: readonly { id: string; title: string }[],
): string {
  const byStep = new Map<string, string[]>();
  for (const issue of issues) {
    const title = createStepTitle(steps, issue.step);
    const list = byStep.get(title) ?? [];
    if (!list.includes(issue.message)) list.push(issue.message);
    byStep.set(title, list);
  }
  return [...byStep.entries()]
    .map(([title, messages]) => `${title} — ${messages.join(" ")}`)
    .join(" ");
}

export function issuesBeforeStep<Step extends string>(
  issues: CreateFieldIssue<Step>[],
  steps: readonly { id: string; title: string }[],
  target: Step,
): CreateFieldIssue<Step>[] {
  const targetIndex = steps.findIndex((step) => step.id === target);
  if (targetIndex <= 0) return [];
  return issues.filter((issue) => {
    const index = steps.findIndex((step) => step.id === issue.step);
    return index >= 0 && index < targetIndex;
  });
}

export function uniqueIssueMessages<Step extends string>(
  issues: CreateFieldIssue<Step>[],
  step?: Step | "review",
): string[] {
  const scoped = !step || step === "review" ? issues : issues.filter((issue) => issue.step === step);
  return [...new Set(scoped.map((issue) => issue.message))];
}
