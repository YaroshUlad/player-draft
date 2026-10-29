import type {HttpTransport} from '../../../infrastructure/http/src/types';
import {createStatsTransports} from './api-stats-transport';
import type {StatsEndpoints} from './api-stats-transport';
import {OneStatProvider} from './one-stat-provider';
import {StatsExtension} from './stats-extension';
import {StatsOutbox} from './stats-outbox';
import type {StatsProvider, StorageLike} from './types';
import {Uv2025StatsProvider} from './uv-2025-provider';

export interface DefaultStatsExtensionOptions {
	endpoints: StatsEndpoints;
	httpTransport?: HttpTransport;
	storage?: StorageLike | null;
	providers?: readonly StatsProvider[];
	autoFlush?: boolean;
	coverageHeartbeatMs?: number;
	createVsid?: () => string;
}

export function createDefaultStatsExtension(options: DefaultStatsExtensionOptions): StatsExtension {
	const transports = createStatsTransports(options.endpoints, options.httpTransport);
	const storage = options.storage === undefined ? getDefaultStatsStorage() : options.storage;
	const outbox = new StatsOutbox(transports, storage);
	return new StatsExtension({
		providers: options.providers ?? [new Uv2025StatsProvider(), new OneStatProvider()],
		outbox,
		...(options.autoFlush !== undefined ? {autoFlush: options.autoFlush} : {}),
		...(options.coverageHeartbeatMs !== undefined ? {coverageHeartbeatMs: options.coverageHeartbeatMs} : {}),
		...(options.createVsid ? {createVsid: options.createVsid} : {})
	});
}

function getDefaultStatsStorage(): StorageLike | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
