import {describe, expect, it} from 'vitest';
import {StatsOutbox} from '../../packages/extensions/stats/src/stats-outbox';
import type {StatEvent} from '../../packages/extensions/stats/src/types';
import {FakeStatsTransport, MemoryStorage} from '../../packages/testing/src/fake-stats';

function createStatEvent(id = 'event-1'): StatEvent {
	return {
		eventId: id,
		eventName: 'playing',
		eventNumber: 1,
		vsid: 'vsid-1',
		sessionId: 'session-1',
		mediaEpoch: 1,
		occurredAt: 1000,
		positionMs: 2000,
		durationMs: 60_000,
		tvtMs: 2000,
		playbackKind: 'content',
		state: 'playing',
		engine: 'fake',
		format: 'mp4',
		quality: '720p',
		item: {rawId: 'video-1', type: 'video', files: {}},
		payload: {}
	};
}

describe('StatsOutbox', () => {
	it('removes events only after transport acknowledgement', async () => {
		const transport = new FakeStatsTransport();
		const outbox = new StatsOutbox({'uv-2025': transport});
		outbox.enqueue('uv-2025', createStatEvent(), {event_name: 'playing'});

		expect(outbox.getPending()).toHaveLength(1);
		expect(await outbox.flush()).toBe(true);

		expect(outbox.getPending()).toHaveLength(0);
		expect(transport.batches).toHaveLength(1);
	});

	it('retains failed events and deduplicates by destination and event id', async () => {
		const transport = new FakeStatsTransport();
		transport.failNext = true;
		const outbox = new StatsOutbox({'uv-2025': transport});
		outbox.enqueue('uv-2025', createStatEvent(), {event_name: 'playing'});
		outbox.enqueue('uv-2025', createStatEvent(), {event_name: 'playing'});

		expect(await outbox.flush()).toBe(false);
		expect(outbox.getPending()).toHaveLength(1);
		expect(await outbox.flush()).toBe(true);
		expect(transport.batches).toHaveLength(1);
	});

	it('restores unacknowledged events from storage', () => {
		const storage = new MemoryStorage();
		const first = new StatsOutbox({}, storage);
		first.enqueue('uv-2025', createStatEvent(), {event_name: 'playing'});

		const restored = new StatsOutbox({}, storage);

		expect(restored.getPending()).toHaveLength(1);
		expect(restored.getPending()[0]?.status).toBe('pending');
	});
});
