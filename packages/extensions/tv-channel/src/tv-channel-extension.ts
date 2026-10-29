import type {PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent} from '../../../contracts/src/playback';
import type {AdCreative, PlaylistItem, Scte35Action, TvProgrammeItem} from '../../../contracts/src/playlist-item';
import type {PlaybackOptions} from '../../../contracts/src/public-api';
import type {AdsExtension} from '../../ads/src/ads-extension';
import type {CustomEventDispatcher} from '../../../sdk/src/custom-event-dispatcher';

export interface TvChannelExtensionOptions {
	ads: AdsExtension;
	dispatcher: CustomEventDispatcher;
	getProgramme?: (item: PlaylistItem) => Promise<readonly TvProgrammeItem[]>;
	getServerTime?: () => Promise<number>;
	getAdCreative?: (action: Scte35Action) => AdCreative;
}

export class TvChannelExtension implements PlayerExtension {
	readonly name = 'tv-channel';
	private currentItem: PlaylistItem | null = null;
	private programme: readonly TvProgrammeItem[] = [];
	private serverTime = 0;
	private readonly handledActions = new Set<number>();
	private firstPlaySent = false;
	private lastHeartbeatAt: number | null = null;

	constructor(private readonly options: TvChannelExtensionOptions) {}

	async beforeOpen(item: PlaylistItem, _options?: PlaybackOptions): Promise<void> {
		if (item.model.type !== 'tv_channel') {
			this.currentItem = null;
			return;
		}
		this.currentItem = item;
		this.programme = item.model.programme ?? [];
		this.handledActions.clear();
		this.firstPlaySent = false;
		this.lastHeartbeatAt = null;
		await this.refreshProgramme();
	}

	onEvent(event: CoreEvent): void {
		if (!this.currentItem) {
			return;
		}
		if (event.type === 'playing') {
			if (this.currentItem.model.isVitrina && !this.firstPlaySent) {
				this.firstPlaySent = true;
				this.emitVitrina('vitrina_tv_first_play_or_ad', event);
			}
			this.lastHeartbeatAt = event.occurredAt;
			return;
		}
		if (event.type === 'timeUpdate') {
			this.handleScte35(event);
			this.handleHeartbeat(event);
			return;
		}
		if (event.type === 'ended' && this.currentItem.model.isVitrina) {
			this.emitVitrina('vitrina_tv_content_end', event);
		}
	}

	async refreshProgramme(): Promise<void> {
		const item = this.currentItem;
		if (!item) {
			return;
		}
		const [programme, serverTime] = await Promise.all([
			this.options.getProgramme ? this.options.getProgramme(item).catch(() => this.programme) : Promise.resolve(this.programme),
			this.options.getServerTime ? this.options.getServerTime().catch(() => Date.now()) : Promise.resolve(Date.now())
		]);
		if (this.currentItem?.model.rawId !== item.model.rawId) {
			return;
		}
		this.programme = programme;
		this.serverTime = serverTime;
		if (item.model.showProgram) {
			this.options.dispatcher.dispatch('tv-channel-server-time-update', {time: serverTime, serverTime});
			this.options.dispatcher.dispatch('tv-channel-programme-update', {
				current: this.getCurrentProgrammeItem(),
				next: this.getNextProgrammeItem()
			});
		}
	}

	shutdown(): void {
		this.currentItem = null;
		this.programme = [];
		this.handledActions.clear();
		this.firstPlaySent = false;
		this.lastHeartbeatAt = null;
	}

	private getCurrentProgrammeItem(): TvProgrammeItem | null {
		return this.programme.find((item) => item.startAtMs <= this.serverTime && item.stopAtMs > this.serverTime) ?? null;
	}

	private getNextProgrammeItem(): TvProgrammeItem | null {
		return this.programme.find((item) => item.startAtMs > this.serverTime) ?? null;
	}

	private handleScte35(event: CoreEvent): void {
		const actions = this.currentItem?.model.scte35Actions ?? [];
		for (const action of actions) {
			if (this.handledActions.has(action.uniqueProgramId) || action.timestampMs > event.positionMs) {
				continue;
			}
			this.handledActions.add(action.uniqueProgramId);
			const creative = this.options.getAdCreative?.(action);
			if (creative) {
				void this.options.ads.playMidrollFromTv(creative, event.positionMs);
			}
		}
	}

	private handleHeartbeat(event: CoreEvent): void {
		if (!this.currentItem?.model.isVitrina) {
			return;
		}
		if (this.lastHeartbeatAt !== null && event.occurredAt - this.lastHeartbeatAt < 30_000) {
			return;
		}
		this.lastHeartbeatAt = event.occurredAt;
		this.emitVitrina('vitrina_tv_heartbeat', event);
	}

	private emitVitrina(eventName: string, event: CoreEvent): void {
		const item = this.currentItem;
		if (!item) {
			return;
		}
		this.options.dispatcher.dispatch('prod-stat-event', {
			eventName,
			commonProperties: {
				videoId: item.model.ovId,
				ownerId: item.model.ownerId,
				programmeId: this.getCurrentProgrammeItem()?.id,
				streamTs: this.serverTime
			},
			payload: {
				playbackPosition: event.positionMs,
				muted: event.snapshot.muted,
				fullscreen: true
			}
		});
	}
}
