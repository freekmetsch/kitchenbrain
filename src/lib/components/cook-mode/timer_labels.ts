function normalizedLabel(value: string): string {
	return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function distinctTimerStepTitle(stepTitle: string, purpose: string): string | null {
	return normalizedLabel(stepTitle) === normalizedLabel(purpose) ? null : stepTitle;
}
