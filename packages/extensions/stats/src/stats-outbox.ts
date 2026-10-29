import type {OutboxRecord, StatEvent, StatsTransport, StorageLike} from './types';

const MAX_QUEUE_SIZE = 1000;
const MAX_RESTORED_CHARS = 256 * 1024;
const DEFAULT_STORAGE_KEY = 'vktv-player-stats-outbox-v1';

export class StatsOutbox {
	private records: OutboxRecord[];
	private readonly inFlight = new Map<string, Promise<boolean>>();
	private droppedCount = 0;

	constructor(
		private readonly transports: Readonly<Record<string, StatsTransport>>,
		private readonly storage: StorageLike | null = null,
		private readonly storageKey = DEFAULT_STORAGE_KEY
	) {
		this.records = this.restore();
	}

	enqueue(destination: string, event: StatEvent, payload: Record<string, unknown>): void {
		const recordId = `${destination}:${event.eventId}`;
		if (this.records.some((record) => record.recordId === recordId)) {
			return;
		}
		this.records.push({recordId, destination, eventId: event.eventId, status: 'pending', payload});
		if (this.records.length > MAX_QUEUE_SIZE) {
			const overflow = this.records.length - MAX_QUEUE_SIZE;
			this.records.splice(0, overflow);
			this.droppedCount += overflow;
		}
		this.persist();
	}

	async flush(destination?: string): Promise<boolean> {
		if (destination) {
			return this.flushDestination(destination);
		}
		const destinations = new Set(this.records.map((record) => record.destination));
		const results = await Promise.all([...destinations].map((item) => this.flushDestination(item)));
		return results.every(Boolean);
	}

	async idle(): Promise<void> {
		await Promise.all([...this.inFlight.values()]);
	}

	getPending(destination?: string): OutboxRecord[] {
		return this.records
			.filter((record) => !destination || record.destination === destination)
			.map((record) => ({...record}));
	}

	getDroppedCount(): number {
		return this.droppedCount;
	}

	private flushDestination(destination: string): Promise<boolean> {
		const active = this.inFlight.get(destination);
		if (active) {
			return active;
		}
		const transport = this.transports[destination];
		if (!transport) {
			return Promise.resolve(false);
		}
		const batch = this.records.filter((record) => record.destination === destination && record.status === 'pending');
		if (batch.length === 0) {
			return Promise.resolve(true);
		}

		const ids = new Set(batch.map((record) => record.recordId));
		for (const record of batch) {
			record.status = 'inFlight';
		}
		this.persist();
		const promise = transport.send(batch)
			.then(() => {
				this.records = this.records.filter((record) => !ids.has(record.recordId));
				this.persist();
				return true;
			})
			.catch(() => {
				for (const record of this.records) {
					if (ids.has(record.recordId)) {
						record.status = 'pending';
					}
				}
				this.persist();
				return false;
			})
			.then((result) => {
				this.inFlight.delete(destination);
				return result;
			});
		this.inFlight.set(destination, promise);
		return promise;
	}

	private restore(): OutboxRecord[] {
		if (!this.storage) {
			return [];
		}
		try {
			const raw = this.storage.getItem(this.storageKey);
			if (!raw) {
				return [];
			}
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				return [];
			}
			const records = parsed.filter((item): item is OutboxRecord => {
				if (!item || typeof item !== 'object') {
					return false;
				}
				const candidate = item as Partial<OutboxRecord>;
				return typeof candidate.recordId === 'string' && typeof candidate.destination === 'string' &&
					typeof candidate.eventId === 'string' && Boolean(candidate.payload);
			}).map((record) => ({...record, status: 'pending' as const}));
			let restored = records.slice(-MAX_QUEUE_SIZE);
			while (restored.length > 0 && JSON.stringify(restored).length > MAX_RESTORED_CHARS) {
				restored = restored.slice(Math.floor(restored.length / 2));
			}
			this.droppedCount = records.length - restored.length;
			return restored;
		} catch {
			return [];
		}
	}

	private persist(): void {
		if (!this.storage) {
			return;
		}
		const pending = this.records;
		try {
			if (pending.length === 0) {
				this.storage.removeItem(this.storageKey);
				return;
			}
			this.storage.setItem(this.storageKey, JSON.stringify(pending));
		} catch {
			let reduced = pending;
			while (reduced.length > 1) {
				reduced = reduced.slice(Math.floor(reduced.length / 2));
				try {
					this.storage.setItem(this.storageKey, JSON.stringify(reduced));
					return;
				} catch {
					break;
				}
			}
		}
	}
}
