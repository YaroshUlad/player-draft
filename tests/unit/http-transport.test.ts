import {describe, expect, it, vi} from 'vitest';
import {FetchHttpTransport} from '../../packages/infrastructure/http/src/fetch-transport';
import {createHttpTransport} from '../../packages/infrastructure/http/src/http-transport-factory';
import {XhrHttpTransport} from '../../packages/infrastructure/http/src/xhr-transport';

class FakeXhr {
	status = 200;
	statusText = 'OK';
	responseText = '{}';
	withCredentials = false;
	timeout = 0;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	ontimeout: (() => void) | null = null;
	onabort: (() => void) | null = null;
	open = vi.fn();
	setRequestHeader = vi.fn();
	send = vi.fn();

	respond(status = 200): void {
		this.status = status;
		this.onload?.();
	}
}

const request = {
	url: 'https://stats.test/events',
	method: 'POST' as const,
	headers: {'content-type': 'application/json'},
	body: '{"events":[]}',
	credentials: 'same-origin' as const
};

describe('HTTP transport factory', () => {
	it('uses fetch when available', async () => {
		const fetchImpl = vi.fn(async () => new Response('{}', {status: 200}));
		const createXhr = vi.fn();
		const transport = createHttpTransport({fetch: fetchImpl, createXhr});

		const response = await transport.request(request);

		expect(transport).toBeInstanceOf(FetchHttpTransport);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(createXhr).not.toHaveBeenCalled();
		expect(response.status).toBe(200);
	});

	it('does not retry a failed fetch through XHR', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error('network failed');
		});
		const createXhr = vi.fn();
		const transport = createHttpTransport({fetch: fetchImpl, createXhr});

		await expect(transport.request(request)).rejects.toThrow('network failed');
		expect(createXhr).not.toHaveBeenCalled();
	});

	it('uses non-blocking XHR when fetch is absent', async () => {
		const xhr = new FakeXhr();
		const transport = createHttpTransport({
			fetch: undefined,
			createXhr: () => xhr as unknown as XMLHttpRequest
		});
		let settled = false;

		const pending = transport.request(request).then((response) => {
			settled = true;
			return response;
		});
		await Promise.resolve();

		expect(transport).toBeInstanceOf(XhrHttpTransport);
		expect(xhr.open).toHaveBeenCalledWith('POST', request.url, true);
		expect(settled).toBe(false);
		xhr.respond();
		expect((await pending).status).toBe(200);
	});

	it('rejects XHR network errors', async () => {
		const xhr = new FakeXhr();
		const transport = new XhrHttpTransport(() => xhr as unknown as XMLHttpRequest);
		const pending = transport.request(request);

		xhr.onerror?.();

		await expect(pending).rejects.toThrow('XHR network error');
	});
});
