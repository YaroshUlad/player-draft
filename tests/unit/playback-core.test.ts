import {describe, expect, it} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {FakeAdapter, FakeAdapterFactory, FakeClock, createOpenRequest} from '../../packages/testing/src';

function createCore() {
	const factory = new FakeAdapterFactory();
	const clock = new FakeClock();
	const core = new PlaybackCore(factory, clock);
	return {core, factory, clock};
}

describe('PlaybackCore', () => {
	it('opens a ready session without autoplay', async () => {
		const {core} = createCore();
		const events: string[] = [];
		core.subscribe((event) => events.push(event.type));

		const snapshot = await core.open(createOpenRequest());

		expect(snapshot.state).toBe('ready');
		expect(snapshot.source?.format).toBe('mp4');
		expect(events).toEqual(['loading', 'ready']);
	});

	it('autoplays after ready when requested', async () => {
		const {core} = createCore();
		const snapshot = await core.open(createOpenRequest({autoplay: true}));

		expect(snapshot.state).toBe('playing');
	});

	it('executes playback commands on the active session', async () => {
		const {core} = createCore();
		await core.open(createOpenRequest());

		await core.play(core.createCommand('play-1'));
		expect(core.getSnapshot().state).toBe('playing');

		await core.pause(core.createCommand('pause-1'));
		expect(core.getSnapshot().state).toBe('paused');

		await core.seek(12_000, core.createCommand('seek-1'));
		expect(core.getSnapshot().positionMs).toBe(12_000);
		expect(core.getSnapshot().state).toBe('paused');
	});

	it('rejects commands from a replaced session', async () => {
		const {core} = createCore();
		await core.open(createOpenRequest());
		const staleCommand = core.createCommand('stale-play');
		await core.open(createOpenRequest({operationId: 'open-2'}));

		await expect(core.play(staleCommand)).rejects.toMatchObject({code: 'STALE_OPERATION'});
		expect(core.getSnapshot().state).toBe('ready');
	});

	it('ignores late events from a replaced adapter', async () => {
		const {core, factory} = createCore();
		await core.open(createOpenRequest());
		await core.open(createOpenRequest({operationId: 'open-2'}));

		factory.adapters[0]?.emit({type: 'playing'});

		expect(core.getSnapshot().state).toBe('ready');
	});

	it('cancels autoplay and rejects open when closed during prepare', async () => {
		const adapter = new FakeAdapter();
		const finishPrepare = adapter.deferPrepare();
		const core = new PlaybackCore({create: () => adapter});
		const openPromise = core.open(createOpenRequest({autoplay: true}));
		const rejection = expect(openPromise).rejects.toMatchObject({code: 'STALE_OPERATION'});
		await Promise.resolve();

		await core.destroy();
		finishPrepare();
		await rejection;

		expect(core.getSnapshot().state).toBe('idle');
	});

	it('validates positions and playback rate', async () => {
		const {core} = createCore();
		await core.open(createOpenRequest());

		await expect(core.seek(-1, core.createCommand('bad-seek'))).rejects.toMatchObject({code: 'INVALID_POSITION'});
		await expect(core.setPlaybackRate(0, core.createCommand('bad-rate'))).rejects.toMatchObject({
			code: 'INVALID_PLAYBACK_RATE'
		});
	});

	it('destroys a session idempotently', async () => {
		const {core} = createCore();
		await core.open(createOpenRequest({autoplay: true}));

		await core.destroy();
		await core.destroy();

		expect(core.getSnapshot().state).toBe('idle');
	});
});
