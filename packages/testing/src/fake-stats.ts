import type {OutboxRecord, StatsTransport, StorageLike} from '../../extensions/stats/src/types';

export class MemoryStorage implements StorageLike {
	private readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

export class FakeStatsTransport implements StatsTransport {
	readonly batches: OutboxRecord[][] = [];
	failNext = false;

	async send(records: readonly OutboxRecord[]): Promise<void> {
		if (this.failNext) {
			this.failNext = false;
			throw new Error('Stats transport failed');
		}
		this.batches.push(records.map((record) => ({...record})));
	}
}
