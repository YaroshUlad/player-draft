import type {OutboxRecord} from '../../extensions/stats/src/types';

export interface StatsTraceEvent {
	destination: string;
	eventName: string;
	eventNumber?: number;
	payload: Readonly<Record<string, unknown>>;
}

export interface StatsTraceCompareOptions {
	timeToleranceMs?: number;
	positionToleranceMs?: number;
	payloadMode?: 'exact' | 'subset';
}

export function recordsToStatsTrace(records: readonly OutboxRecord[]): StatsTraceEvent[] {
	return records.map((record) => ({
		destination: record.destination,
		eventName: String(record.payload.event_name ?? record.payload.eventName ?? ''),
		...(typeof record.payload.event_number === 'number' ? {eventNumber: record.payload.event_number} : {}),
		payload: record.payload
	}));
}

export function compareStatsTraces(
	expected: readonly StatsTraceEvent[],
	actual: readonly StatsTraceEvent[],
	options: StatsTraceCompareOptions = {}
): string[] {
	const differences: string[] = [];
	const length = Math.max(expected.length, actual.length);
	for (let index = 0; index < length; index++) {
		const expectedEvent = expected[index];
		const actualEvent = actual[index];
		if (!expectedEvent || !actualEvent) {
			differences.push(`[${index}] event count differs: expected ${expected.length}, actual ${actual.length}`);
			break;
		}
		if (expectedEvent.destination !== actualEvent.destination) {
			differences.push(`[${index}].destination: expected ${expectedEvent.destination}, actual ${actualEvent.destination}`);
		}
		if (expectedEvent.eventName !== actualEvent.eventName) {
			differences.push(`[${index}].eventName: expected ${expectedEvent.eventName}, actual ${actualEvent.eventName}`);
		}
		if (expectedEvent.eventNumber !== undefined && expectedEvent.eventNumber !== actualEvent.eventNumber) {
			differences.push(`[${index}].eventNumber: expected ${expectedEvent.eventNumber}, actual ${actualEvent.eventNumber}`);
		}
		compareValues(
			expectedEvent.payload,
			actualEvent.payload,
			`[${index}].payload`,
			differences,
			options,
			options.payloadMode ?? 'exact'
		);
	}
	return differences;
}

export function assertStatsTrace(
	expected: readonly StatsTraceEvent[],
	actual: readonly StatsTraceEvent[],
	options: StatsTraceCompareOptions = {}
): void {
	const differences = compareStatsTraces(expected, actual, options);
	if (differences.length > 0) {
		throw new Error(`Stats traces differ:\n${differences.join('\n')}`);
	}
}

function compareValues(
	expected: unknown,
	actual: unknown,
	path: string,
	differences: string[],
	options: StatsTraceCompareOptions,
	mode: 'exact' | 'subset'
): void {
	if (typeof expected === 'number' && typeof actual === 'number') {
		const tolerance = path.endsWith('client_time') ? options.timeToleranceMs ?? 1000
			: path.endsWith('playback_position') ? options.positionToleranceMs ?? 0
				: 0;
		if (Math.abs(expected - actual) > tolerance) {
			differences.push(`${path}: expected ${expected}, actual ${actual}, tolerance ${tolerance}`);
		}
		return;
	}
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || expected.length !== actual.length) {
			differences.push(`${path}: array length differs`);
			return;
		}
		for (let index = 0; index < expected.length; index++) {
			compareValues(expected[index], actual[index], `${path}[${index}]`, differences, options, mode);
		}
		return;
	}
	if (isRecord(expected)) {
		if (!isRecord(actual)) {
			differences.push(`${path}: expected object, actual ${format(actual)}`);
			return;
		}
		const expectedKeys = Object.keys(expected).sort();
		const actualKeys = Object.keys(actual).sort();
		if (mode === 'exact' && JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
			differences.push(`${path}: expected keys ${expectedKeys.join(',')}, actual keys ${actualKeys.join(',')}`);
			return;
		}
		for (const key of expectedKeys) {
			compareValues(expected[key], actual[key], `${path}.${key}`, differences, options, mode);
		}
		return;
	}
	if (expected !== actual) {
		differences.push(`${path}: expected ${format(expected)}, actual ${format(actual)}`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function format(value: unknown): string {
	return JSON.stringify(value) ?? String(value);
}
