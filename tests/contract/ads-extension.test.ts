import {describe, expect, it, vi} from 'vitest';
import type {AdCreative} from '../../packages/contracts/src/playlist-item';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

const creative: AdCreative = {
	id: 'ad-1',
	url: 'https://ads.test/ad.mp4',
	mediaType: 'mp4',
	durationMs: 1_000,
	allowSkip: true,
	skipAfterMs: 0
};

function createPlayer(factory = new FakeAdapterFactory()) {
	const eventTarget = new EventTarget();
	const player = new PlayerLib({core: new PlaybackCore(factory), eventTarget});
	const events: {name: string; detail: unknown}[] = [];
	for (const name of [
		'player-advertisement-start',
		'player-advertisement-started-playing',
		'player-advertisement-end',
		'player-advertisement-error',
		'event-video-ended',
		'prod-stat-event'
	]) {
		eventTarget.addEventListener(name, (event) => {
			events.push({name, detail: (event as CustomEvent).detail});
		});
	}
	return {player, factory, eventTarget, events};
}

async function initPlayer(player: PlayerLib): Promise<void> {
	await player.init({
		appVersion: 'test',
		uid: 'device',
		token: 'token',
		statsToken: 'stats-token',
		isAnonymous: true,
		locale: 'ru',
		host: 'https://api.test',
		proxyHost: '',
		node: {} as HTMLDivElement,
		capabilities: fakeCapabilities
	});
}

function itemWithAds(section: 'preroll' | 'midroll' | 'postroll') {
	return {
		...fakePlaylistItem,
		model: {
			...fakePlaylistItem.model,
			ads: section === 'midroll' ? {midroll: [{...creative, startMs: 3_000}]} : {[section]: [creative]}
		}
	};
}

describe('AdsExtension', () => {
	it('plays preroll and then opens content', async () => {
		const {player, factory, events} = createPlayer();
		await initPlayer(player);
		const open = player.open(itemWithAds('preroll'), {autoplay: false});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(1));

		factory.adapters[0]?.emit({type: 'ended'});
		await open;

		expect(factory.adapters).toHaveLength(2);
		expect(player.getPlaybackInterface().getState()).toBe('ready');
		expect(events.map((event) => event.name)).toContain('player-advertisement-start');
		expect(events.map((event) => event.name)).toContain('player-advertisement-started-playing');
		expect(events.map((event) => event.name)).toContain('player-advertisement-end');
		expect(events.map((event) => event.name)).not.toContain('event-video-ended');
	});

	it('resumes content after midroll', async () => {
		const {player, factory} = createPlayer();
		await initPlayer(player);
		await player.open(itemWithAds('midroll'), {autoplay: false});

		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 5_000});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(2));
		factory.adapters[1]?.emit({type: 'ended'});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(3));

		expect(player.getPlaybackInterface().getStateInfo().currentTime).toBe(5_000);
		expect(player.getPlaybackInterface().getState()).toBe('ready');
	});

	it('plays postroll before item ended', async () => {
		const {player, factory, events} = createPlayer();
		await initPlayer(player);
		await player.open(itemWithAds('postroll'), {autoplay: false});

		factory.adapters[0]?.emit({type: 'ended'});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(2));
		expect(events.map((event) => event.name)).not.toContain('event-video-ended');

		factory.adapters[1]?.emit({type: 'ended'});
		await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('event-video-ended'));
		expect(factory.adapters).toHaveLength(2);
	});

	it('skips an allowed ad through public playback', async () => {
		const {player, factory} = createPlayer();
		await initPlayer(player);
		const open = player.open(itemWithAds('preroll'), {autoplay: false});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(1));

		await player.getPlaybackInterface().skipAdv();
		await open;

		expect(factory.adapters).toHaveLength(2);
		expect(player.getPlaybackInterface().getState()).toBe('ready');
	});

	it('continues content after an ad error', async () => {
		const factory = new FakeAdapterFactory();
		const originalCreate = factory.create.bind(factory);
		factory.create = (source, capabilities) => {
			const adapter = originalCreate(source, capabilities);
			if (factory.adapters.length === 1) {
				adapter.failPrepare(new Error('ad failed'));
			}
			return adapter;
		};
		const {player, events} = createPlayer(factory);
		await initPlayer(player);

		await player.open(itemWithAds('preroll'), {autoplay: false});

		expect(player.getPlaybackInterface().getState()).toBe('ready');
		expect(events.map((event) => event.name)).toContain('player-advertisement-error');
		expect(events.map((event) => event.name)).toContain('player-advertisement-end');
	});
});
