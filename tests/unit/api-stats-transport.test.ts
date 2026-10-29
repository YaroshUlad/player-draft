import {describe, expect, it, vi} from 'vitest';
import {ApiStatsTransport} from '../../packages/extensions/stats/src/api-stats-transport';
import type {HttpRequest, HttpResponse} from '../../packages/infrastructure/http/src/types';

function createHttp(status = 200) {
	return {
		request: vi.fn(async (_request: HttpRequest): Promise<HttpResponse> => ({
			status,
			statusText: '',
			body: '{}'
		}))
	};
}

const record = {
	recordId: 'uv-2025:event-1',
	destination: 'uv-2025',
	eventId: 'event-1',
	status: 'pending' as const,
	payload: {event_name: 'playing'}
};

describe('ApiStatsTransport', () => {
	it('serializes batches and authentication headers', async () => {
		const http = createHttp();
		const transport = new ApiStatsTransport({
			url: 'https://stats.test/uv',
			token: 'secret-token',
			timeoutMs: 1000
		}, http);

		await transport.send([record]);

		expect(http.request).toHaveBeenCalledWith(expect.objectContaining({
			url: 'https://stats.test/uv',
			method: 'POST',
			body: JSON.stringify({events: [{event_name: 'playing'}]}),
			timeoutMs: 1000
		}));
		expect(http.request.mock.calls[0]?.[0].headers.authorization).toBe('Bearer secret-token');
	});

	it('rejects non-2xx responses so outbox retains events', async () => {
		const http = createHttp(503);
		const transport = new ApiStatsTransport({url: 'https://stats.test/uv'}, http);

		await expect(transport.send([record])).rejects.toThrow('HTTP 503');
	});
});
