import Hls from 'hls.js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HlsJsAdapter} from '../../packages/engines/hls/src/hls-js-adapter';
import {fakeCapabilities} from '../../packages/testing/src';

class FakeVideo extends EventTarget {
	controls = false;
	preload = '';
	playsInline = false;
	muted = false;
	volume = 1;
	playbackRate = 1;
	currentTime = 0;
	duration = 10;
	readyState = 0;
	src = '';
	error = null;
	textTracks: TextTrack[] = [];
	seekable = {length: 1, start: () => 0, end: () => 10};
	load = vi.fn();
	remove = vi.fn();
	removeAttribute = vi.fn();
	setAttribute = vi.fn();
	play = vi.fn(async () => undefined);
	pause = vi.fn();
}

class FakeHls {
	levels = [
		{height: 360, bitrate: 800_000},
		{height: 720, bitrate: 2_500_000}
	];
	currentLevel = 1;
	audioTracks = [{id: 0, name: 'English', lang: 'en', default: true}];
	subtitleTracks = [{id: 1, name: 'English', lang: 'en'}];
	audioTrack = 0;
	subtitleTrack = -1;
	loadSource = vi.fn();
	attachMedia = vi.fn();
	destroy = vi.fn();
	on = vi.fn((name: string, callback: (event: string, data: unknown) => void) => {
		this.listeners.set(name, callback);
	});
	listeners = new Map<string, (event: string, data: unknown) => void>();
	config: unknown;

	constructor(config: unknown) {
		this.config = config;
	}
}

function createAdapter() {
	const video = new FakeVideo();
	vi.stubGlobal('document', {createElement: () => video});
	vi.stubGlobal('HTMLMediaElement', {HAVE_METADATA: 1});
	const hls = new FakeHls(null);
	const adapter = new HlsJsAdapter((config) => {
		hls.config = config;
		return hls as unknown as Hls;
	});
	const surface = {appendChild: vi.fn()};
	const prepare = adapter.prepare({
		source: {
			url: '/video.m3u8',
			format: 'hls',
			variant: 'hls',
			mimeType: 'application/vnd.apple.mpegurl'
		},
		surface: surface as unknown as HTMLElement,
		startPositionMs: 500,
		muted: true,
		capabilities: fakeCapabilities
	});
	return {adapter, hls, video, surface, prepare};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('HlsJsAdapter', () => {
	it('loads source with start position and maps levels and tracks', async () => {
		const {adapter, hls, video, prepare} = createAdapter();
		video.dispatchEvent(new Event('canplay'));
		await prepare;
		const snapshot = adapter.getTechnicalSnapshot();

		expect(hls.loadSource).toHaveBeenCalledWith('/video.m3u8');
		expect(hls.attachMedia).toHaveBeenCalledWith(video);
		expect(hls.config).toMatchObject({startPosition: 0.5, liveDurationInfinity: true});
		expect(snapshot.engine).toEqual({type: 'hlsjs', version: '1.0.5'});
		expect(snapshot.quality.current).toBe('720p');
		expect(snapshot.quality.available).toEqual(['Auto', '360p', '720p']);
		expect(snapshot.audioTracks[0]?.language).toBe('en');
		expect(snapshot.textTracks).toHaveLength(1);
	});

	it('switches quality, audio and text tracks', async () => {
		const {adapter, hls, video, prepare} = createAdapter();
		video.dispatchEvent(new Event('canplay'));
		await prepare;

		adapter.setQuality('360p');
		adapter.setAudioTrack('0');
		adapter.setTextTrack('1');

		expect(hls.currentLevel).toBe(0);
		expect(hls.audioTrack).toBe(0);
		expect(hls.subtitleTrack).toBe(1);
		expect(adapter.getTechnicalSnapshot().quality.requested).toBe('360p');
	});

	it('maps fatal HLS errors and destroys the engine', async () => {
		const {adapter, hls, video, prepare} = createAdapter();
		const events: string[] = [];
		adapter.subscribe((event) => events.push(event.type));
		video.dispatchEvent(new Event('canplay'));
		await prepare;

		hls.listeners.get(Hls.Events.ERROR)?.(Hls.Events.ERROR, {
			fatal: true,
			type: 'network',
			details: 'manifestLoadError'
		});
		await adapter.destroy();

		expect(events).toContain('error');
		expect(hls.destroy).toHaveBeenCalledOnce();
		expect(video.remove).toHaveBeenCalledOnce();
	});
});
