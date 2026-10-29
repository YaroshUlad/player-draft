import {createHttpTransport} from '../../../infrastructure/http/src/http-transport-factory';
import type {HttpTransport} from '../../../infrastructure/http/src/types';
import type {OutboxRecord, StatsTransport} from './types';

export interface StatsEndpointConfig {
	url: string;
	headers?: Readonly<Record<string, string>>;
	token?: string;
	body?: 'events' | 'array';
	timeoutMs?: number;
	credentials?: 'omit' | 'same-origin' | 'include';
}

export interface StatsEndpoints {
	uv2025?: StatsEndpointConfig;
	oneStat?: StatsEndpointConfig;
}

export class ApiStatsTransport implements StatsTransport {
	constructor(
		private readonly endpoint: StatsEndpointConfig,
		private readonly http: HttpTransport
	) {}

	async send(records: readonly OutboxRecord[]): Promise<void> {
		if (records.length === 0) {
			return;
		}
		const events = records.map((record) => record.payload);
		const response = await this.http.request({
			url: this.endpoint.url,
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(this.endpoint.token ? {authorization: `Bearer ${this.endpoint.token}`} : {}),
				...this.endpoint.headers
			},
			body: JSON.stringify(this.endpoint.body === 'array' ? events : {events}),
			...(this.endpoint.timeoutMs !== undefined ? {timeoutMs: this.endpoint.timeoutMs} : {}),
			credentials: this.endpoint.credentials ?? 'same-origin'
		});
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Stats endpoint returned HTTP ${response.status}`);
		}
	}
}

export function createStatsTransports(
	endpoints: StatsEndpoints,
	http: HttpTransport = createHttpTransport()
): Record<string, StatsTransport> {
	const transports: Record<string, StatsTransport> = {};
	if (endpoints.uv2025) {
		transports['uv-2025'] = new ApiStatsTransport(endpoints.uv2025, http);
	}
	if (endpoints.oneStat) {
		transports['one-stat'] = new ApiStatsTransport(endpoints.oneStat, http);
	}
	return transports;
}
