import {describe, expect, it} from 'vitest';
import {SourcePlanner} from '../../packages/core/src/source-planner';
import {fakeCapabilities} from '../../packages/testing/src';

const files = {
	hls: 'https://media.test/video.m3u8',
	dashSep: 'https://media.test/video.mpd',
	mp41080: 'https://media.test/video-1080.mp4',
	mp4720: 'https://media.test/video-720.mp4',
	failoverHost: 'https://fallback.test'
};

describe('SourcePlanner', () => {
	it('uses format preference and keeps failover metadata', () => {
		const planner = new SourcePlanner();
		const sources = planner.plan(files, fakeCapabilities, {preferredFormats: ['dash', 'hls', 'mp4']});

		expect(sources[0]).toMatchObject({
			format: 'dash',
			variant: 'dashSep',
			failoverHost: 'https://fallback.test'
		});
	});

	it('filters sources unsupported by device capabilities', () => {
		const planner = new SourcePlanner();
		const sources = planner.plan(files, {
			...fakeCapabilities,
			hlsJs: false,
			dashJs: false,
			vkPlayer: false,
			mse: false,
			supportedMimeTypes: ['video/mp4']
		});

		expect(sources.every((source) => source.format === 'mp4')).toBe(true);
		expect(sources.map((source) => source.quality)).toEqual(['1080p', '720p']);
	});

	it('allows DASH through Shaka when native MIME support is absent', () => {
		const planner = new SourcePlanner();
		const sources = planner.plan(files, {
			...fakeCapabilities,
			dashJs: true,
			supportedMimeTypes: ['video/mp4']
		});

		expect(sources.some((source) => source.format === 'dash')).toBe(true);
	});

	it('throws a typed error when no source is supported', () => {
		const planner = new SourcePlanner();

		expect(() => planner.getInitialSource({}, fakeCapabilities)).toThrowError(
			expect.objectContaining({code: 'NO_SUPPORTED_SOURCE'})
		);
	});
});
