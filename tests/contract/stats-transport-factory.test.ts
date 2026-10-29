import {describe, expect, it, vi} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {createDefaultStatsExtension} from '../../packages/extensions/stats/src/create-stats-extension';
import type {HttpRequest, HttpResponse} from '../../packages/infrastructure/http/src/types';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

describe('default stats factory', () => {
	it('connects endpoint transports to the stats lifecycle', async () => {
		const requests: HttpRequest[] = [];
		const httpTransport = {
			request: vi.fn(async (request: HttpRequest): Promise<HttpResponse> => {
				requests.push(request);
				return {status: 204, statusText: 'No Content', body: ''};
			})
		};
		const stats = createDefaultStatsExtension({
			endpoints: {
				uv2025: {url: 'https://stats.test/uv'},
				oneStat: {url: 'https://stats.test/one'}
			},
			httpTransport,
			storage: null,
			autoFlush: false,
			createVsid: () => 'vsid-factory'
		});
		const player = new PlayerLib({
			core: new PlaybackCore(new FakeAdapterFactory()),
			eventTarget: new EventTarget(),
			extensions: [stats]
		});
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

		await player.open(fakePlaylistItem);
		await player.close();

		expect(requests.map((request) => request.url)).toEqual([
			'https://stats.test/uv',
			'https://stats.test/one'
		]);
		for (const request of requests) {
			const body = JSON.parse(request.body ?? '{}') as {events: {vsid?: string}[]};
			expect(body.events[0]?.vsid).toBe('vsid-factory');
		}
	});
});
