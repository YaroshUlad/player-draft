import type {PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent} from '../../../contracts/src/playback';
import type {LiveStatus, PlaylistItem} from '../../../contracts/src/playlist-item';
import type {PlaybackOptions} from '../../../contracts/src/public-api';
import type {PlaybackCore} from '../../../core/src/playback-core';
import type {CustomEventDispatcher} from '../../../sdk/src/custom-event-dispatcher';

export interface LiveScheduler {
	setInterval(callback: () => void, intervalMs: number): unknown;
	clearInterval(handle: unknown): void;
}

const defaultScheduler: LiveScheduler = {
	setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
	clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>)
};

export interface LiveExtensionOptions {
	core: PlaybackCore;
	reload: (item: PlaylistItem, options: PlaybackOptions) => Promise<void>;
	dispatcher: CustomEventDispatcher;
	getLiveStatus?: (item: PlaylistItem) => Promise<LiveStatus>;
	intervalMs?: number;
	scheduler?: LiveScheduler;
}

export class LiveExtension implements PlayerExtension {
	readonly name = 'live';
	private currentItem: PlaylistItem | null = null;
	private currentOptions: PlaybackOptions = {};
	private currentStatus: LiveStatus = 'started';
	private pausedAt: number | null = null;
	private monitorHandle: unknown = null;
	private generation = 0;

	constructor(private readonly options: LiveExtensionOptions) {}

	beforeOpen(item: PlaylistItem, options?: PlaybackOptions): void {
		if (!this.isLiveItem(item)) {
			this.currentItem = null;
			return;
		}
		const isSameItem = this.currentItem?.model.rawId === item.model.rawId;
		this.currentItem = item;
		this.currentOptions = options ?? {};
		if (!isSameItem) {
			this.currentStatus = item.model.liveStatus ?? 'started';
		}
		this.pausedAt = null;
		this.startMonitoring();
	}

	onEvent(event: CoreEvent): void {
		if (event.playbackKind !== 'content' || !this.currentItem) {
			return;
		}
		if (event.type === 'paused') {
			this.pausedAt = event.occurredAt;
			return;
		}
		if (event.type !== 'playing') {
			return;
		}
		const pausedAt = this.pausedAt;
		this.pausedAt = null;
		if (!this.currentItem.model.liveCanRewind || pausedAt === null) {
			return;
		}
		const offsetMs = event.occurredAt - pausedAt;
		if (offsetMs < 60_000) {
			return;
		}
		void this.options.core.seekLive(offsetMs, this.options.core.createCommand(`live-resume-${generationId()}`))
			.catch(() => {
				this.options.dispatcher.dispatch('player-recovery-failed', {reason: 'recover-fail'});
			});
	}

	async pollLiveStatus(): Promise<void> {
		const item = this.currentItem;
		const provider = this.options.getLiveStatus;
		if (!item || !provider) {
			return;
		}
		const generation = this.generation;
		try {
			const nextStatus = await provider(item);
			if (generation !== this.generation || this.currentItem?.model.rawId !== item.model.rawId) {
				return;
			}
			this.applyStatus(nextStatus);
		} catch {
			return;
		}
	}

	shutdown(): void {
		this.generation++;
		this.stopMonitoring();
		this.currentItem = null;
		this.currentOptions = {};
		this.pausedAt = null;
	}

	private applyStatus(nextStatus: LiveStatus): void {
		const item = this.currentItem;
		if (!item || nextStatus === this.currentStatus) {
			return;
		}
		const previousStatus = this.currentStatus;
		this.currentStatus = nextStatus;
		this.options.dispatcher.dispatch('player-live-status-changed', {from: previousStatus, to: nextStatus});
		const shouldReload = (previousStatus === 'upcoming' || previousStatus === 'waiting') && nextStatus === 'started';
		const shouldOpenVod = nextStatus === 'finished' || nextStatus === 'postlive';
		if (!shouldReload && !shouldOpenVod) {
			return;
		}
		const generation = ++this.generation;
		void this.options.reload(item, {...this.currentOptions, autoplay: true}).catch(() => {
			if (generation === this.generation) {
				this.options.dispatcher.dispatch('player-recovery-failed', {reason: 'recover-fail'});
			}
		});
	}

	private startMonitoring(): void {
		this.stopMonitoring();
		if (!this.options.getLiveStatus || (this.options.intervalMs ?? 5_000) <= 0) {
			return;
		}
		const scheduler = this.options.scheduler ?? defaultScheduler;
		this.monitorHandle = scheduler.setInterval(() => {
			void this.pollLiveStatus();
		}, this.options.intervalMs ?? 5_000);
	}

	private stopMonitoring(): void {
		if (this.monitorHandle !== null) {
			(this.options.scheduler ?? defaultScheduler).clearInterval(this.monitorHandle);
			this.monitorHandle = null;
		}
	}

	private isLiveItem(item: PlaylistItem): boolean {
		return item.model.type === 'live' || item.model.type === 'tv_channel' || Boolean(item.model.isLive);
	}
}

let liveCommandCounter = 0;

function generationId(): number {
	return ++liveCommandCounter;
}
