import {describe, expect, it} from 'vitest';
import {assertStatsTrace, compareStatsTraces} from '../../packages/testing/src/stats-trace-comparator';
import type {StatsTraceEvent} from '../../packages/testing/src/stats-trace-comparator';

const expected: StatsTraceEvent[] = [{
	destination: 'uv-2025',
	eventName: 'playing',
	eventNumber: 4,
	payload: {
		event_name: 'playing',
		event_number: 4,
		vsid: 'vsid-1',
		client_time: 10_000,
		playback_position: 2_000,
		current_tvt: 2
	}
}];

function actualWith(payload: Record<string, unknown>): StatsTraceEvent[] {
	return [{...expected[0]!, payload} as StatsTraceEvent];
}

describe('StatsTraceComparator', () => {
	it('accepts equivalent payload within time tolerance', () => {
		const actual = actualWith({
			event_name: 'playing',
			event_number: 4,
			vsid: 'vsid-1',
			client_time: 10_500,
			playback_position: 2_000,
			current_tvt: 2
		});

		expect(compareStatsTraces(expected, actual)).toEqual([]);
	});

	it('reports payload, identity and ordering differences', () => {
		const actual = actualWith({
			event_name: 'pause',
			event_number: 5,
			vsid: 'other-vsid',
			client_time: 20_000,
			playback_position: 8_000,
			current_tvt: 2
		});

		expect(compareStatsTraces(expected, actual).join('\n')).toContain('vsid');
		expect(compareStatsTraces(expected, actual).join('\n')).toContain('client_time');
		expect(compareStatsTraces(expected, actual).join('\n')).toContain('playback_position');
	});

	it('rejects missing and additional payload fields in exact mode', () => {
		const actual = actualWith({
			event_name: 'playing',
			event_number: 4,
			vsid: 'vsid-1',
			client_time: 10_000,
			playback_position: 2_000,
			current_tvt: 2,
			unexpected: true
		});

		expect(() => assertStatsTrace(expected, actual)).toThrow('expected keys');
	});

	it('rejects missing events', () => {
		expect(compareStatsTraces(expected, []).join('\n')).toContain('event count differs');
	});
});
