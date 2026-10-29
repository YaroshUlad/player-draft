export interface SubtitleCue {
	startMs: number;
	endMs: number;
	text: string;
}

export function parseVtt(input: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	const blocks = input.replace(/\r/g, '').split(/\n\n+/);
	for (const block of blocks) {
		const lines = block.split('\n').filter((line) => line.trim().length > 0);
		const timingIndex = lines.findIndex((line) => line.includes('-->'));
		if (timingIndex < 0) {
			continue;
		}
		const timing = lines[timingIndex];
		const text = lines.slice(timingIndex + 1).join('\n').trim();
		if (!timing || !text) {
			continue;
		}
		const [start, end] = timing.split('-->').map((value) => value.trim().split(' ')[0]);
		if (!start || !end) {
			continue;
		}
		cues.push({startMs: parseVttTime(start), endMs: parseVttTime(end), text});
	}
	return cues.filter((cue) => cue.endMs >= cue.startMs).sort((left, right) => left.startMs - right.startMs);
}

function parseVttTime(value: string): number {
	const normalized = value.replace(',', '.');
	const parts = normalized.split(':').map(Number);
	if (parts.some(Number.isNaN)) {
		return 0;
	}
	if (parts.length === 3) {
		return ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
	}
	if (parts.length === 2) {
		return ((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000;
	}
	return (parts[0] ?? 0) * 1000;
}
