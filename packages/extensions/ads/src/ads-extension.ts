import type {NextOpen, OpenExtensionContext, PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent, DeviceCapabilities, Source} from '../../../contracts/src/playback';
import type {AdCreative, AdSection, PlaylistItem} from '../../../contracts/src/playlist-item';
import type {PlaybackOptions} from '../../../contracts/src/public-api';
import type {PlaybackCore} from '../../../core/src/playback-core';
import type {CustomEventDispatcher} from '../../../sdk/src/custom-event-dispatcher';

interface ActiveAd {
	creative: AdCreative;
	section: AdSection;
	startedAt: number;
	playingNotified: boolean;
	completion: Promise<void>;
	complete: () => void;
}

interface ContentSession {
	item: PlaylistItem;
	options: PlaybackOptions;
	source: Source;
	next: NextOpen;
}

export interface AdsExtensionOptions {
	core: PlaybackCore;
	getSurface: () => HTMLElement;
	getCapabilities: () => DeviceCapabilities;
	dispatcher: CustomEventDispatcher;
}

export class AdsExtension implements PlayerExtension {
	readonly name = 'advertisement';
	private content: ContentSession | null = null;
	private activeAd: ActiveAd | null = null;
	private readonly playedCreativeIds = new Set<string>();
	private operationCounter = 0;

	constructor(private readonly options: AdsExtensionOptions) {}

	async aroundOpen(context: OpenExtensionContext, next: NextOpen): Promise<void> {
		this.content = {
			item: context.item,
			options: context.options,
			source: context.source,
			next
		};
		this.playedCreativeIds.clear();
		const startPositionMs = context.options.startPositionMs ?? context.item.playback.startPosition ?? 0;
		await this.playRoll('preroll', context.item.model.ads?.preroll ?? []);
		await next(context.source, startPositionMs);
	}

	onEvent(event: CoreEvent): boolean | void {
		if (event.playbackKind === 'advertisement') {
			if (event.type === 'playing' && this.activeAd && !this.activeAd.playingNotified) {
				this.activeAd.playingNotified = true;
				this.options.dispatcher.dispatch('player-advertisement-started-playing');
				this.track('playing', this.activeAd);
			}
			if (event.type === 'ended') {
				this.completeActiveAd();
			}
			return true;
		}
		if (!this.content || this.activeAd) {
			return;
		}
		if (event.type === 'timeUpdate') {
			const creative = this.findMidroll(event.positionMs);
			if (creative) {
				void this.playRoll('midroll', [creative]).then(() => this.resumeContent(event.positionMs));
			}
			return;
		}
		if (event.type === 'ended') {
			const postroll = this.unplayedCreatives('postroll');
			if (postroll.length > 0) {
				void this.playRoll('postroll', postroll).then(() => {
					this.options.dispatcher.dispatch('event-video-ended');
				});
				return true;
			}
		}
	}

	async skipAdv(): Promise<void> {
		const activeAd = this.activeAd;
		if (!activeAd || !activeAd.creative.allowSkip) {
			return;
		}
		const skipAfterMs = activeAd.creative.skipAfterMs ?? 0;
		if (Date.now() - activeAd.startedAt < skipAfterMs) {
			return;
		}
		this.track('skip', activeAd);
		this.completeActiveAd();
		await this.options.core.destroy();
	}

	async playMidrollFromTv(creative: AdCreative, resumePositionMs: number): Promise<boolean> {
		if (this.activeAd) {
			return false;
		}
		await this.playRoll('midroll', [creative]);
		await this.resumeContent(resumePositionMs);
		return true;
	}

	async shutdown(): Promise<void> {
		this.completeActiveAd();
		this.content = null;
		this.playedCreativeIds.clear();
		await this.options.core.destroy();
	}

	private async playRoll(section: AdSection, creatives: readonly AdCreative[]): Promise<void> {
		if (creatives.length === 0) {
			return;
		}
		for (const creative of creatives) {
			if (this.playedCreativeIds.has(creative.id)) {
				continue;
			}
			this.playedCreativeIds.add(creative.id);
			await this.playCreative(section, creative);
		}
		this.options.dispatcher.dispatch('player-advertisement-end', {section});
		this.trackSectionEnd(section);
	}

	private async playCreative(section: AdSection, creative: AdCreative): Promise<void> {
		let resolveCompletion = (): void => undefined;
		const completion = new Promise<void>((resolve) => {
			resolveCompletion = resolve;
		});
		const activeAd: ActiveAd = {
			creative,
			section,
			startedAt: Date.now(),
			playingNotified: false,
			completion,
			complete: () => resolveCompletion()
		};
		this.activeAd = activeAd;
		this.options.dispatcher.dispatch('player-advertisement-start', {
			data: {
				section,
				id: creative.id,
				url: creative.url,
				mediaType: creative.mediaType,
				duration: creative.durationMs,
				allowClose: Boolean(creative.allowSkip),
				allowCloseDelay: creative.skipAfterMs ?? 0,
				...(creative.startMs !== undefined ? {point: creative.startMs} : {})
			}
		});
		this.track('start', activeAd);

		try {
			await this.options.core.open({
				source: this.toSource(creative),
				surface: this.options.getSurface(),
				capabilities: this.options.getCapabilities(),
				startPositionMs: 0,
				autoplay: true,
				muted: this.options.core.getSnapshot().muted,
				operationId: `ad-${++this.operationCounter}`,
				playbackKind: 'advertisement',
				metadata: {
					section,
					creativeId: creative.id,
					durationMs: creative.durationMs
				}
			});
			await activeAd.completion;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.options.dispatcher.dispatch('player-advertisement-error', {error: message});
			this.track('error', activeAd);
		} finally {
			if (this.activeAd === activeAd) {
				this.activeAd = null;
			}
		}
	}

	private completeActiveAd(): void {
		const activeAd = this.activeAd;
		if (!activeAd) {
			return;
		}
		this.activeAd = null;
		activeAd.complete();
	}

	private async resumeContent(positionMs: number): Promise<void> {
		const content = this.content;
		if (!content) {
			return;
		}
		await content.next(content.source, positionMs);
	}

	private findMidroll(positionMs: number): AdCreative | null {
		const creatives = this.content?.item.model.ads?.midroll ?? [];
		return creatives.find((creative) =>
			!this.playedCreativeIds.has(creative.id) && (creative.startMs ?? 0) <= positionMs
		) ?? null;
	}

	private unplayedCreatives(section: AdSection): AdCreative[] {
		const creatives = section === 'preroll' ? this.content?.item.model.ads?.preroll
			: section === 'midroll' ? this.content?.item.model.ads?.midroll
				: this.content?.item.model.ads?.postroll;
		return (creatives ?? []).filter((creative) => !this.playedCreativeIds.has(creative.id));
	}

	private toSource(creative: AdCreative): Source {
		return {
			url: creative.url,
			format: creative.mediaType,
			variant: creative.mediaType,
			mimeType: creative.mediaType === 'mp4' ? 'video/mp4' : 'application/vnd.apple.mpegurl'
		};
	}

	private track(stage: string, ad: ActiveAd): void {
		this.options.dispatcher.dispatch('prod-stat-event', {
			eventName: 'ads_playback',
			commonProperties: {itemId: this.content?.item.model.rawId},
			payload: {
				stage,
				section: ad.section,
				creativeId: ad.creative.id,
				positionMs: this.options.core.getSnapshot().positionMs
			}
		});
	}

	private trackSectionEnd(section: AdSection): void {
		this.options.dispatcher.dispatch('prod-stat-event', {
			eventName: 'ads_playback',
			commonProperties: {itemId: this.content?.item.model.rawId},
			payload: {stage: 'section-ended', section}
		});
	}
}
