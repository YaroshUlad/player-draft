import type {PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent} from '../../../contracts/src/playback';
import type {PlaylistItem} from '../../../contracts/src/playlist-item';
import type {PlaybackOptions} from '../../../contracts/src/public-api';
import type {CustomEventDispatcher} from '../../../sdk/src/custom-event-dispatcher';

export interface PlaylistExtensionOptions {
	open: (item: PlaylistItem, options: PlaybackOptions) => Promise<void>;
	dispatcher: CustomEventDispatcher;
}

export class PlaylistExtension implements PlayerExtension {
	readonly name = 'playlist';
	private currentItem: PlaylistItem | null = null;
	private currentOptions: PlaybackOptions = {};
	private generation = 0;

	constructor(private readonly options: PlaylistExtensionOptions) {}

	beforeOpen(item: PlaylistItem, options?: PlaybackOptions): void {
		this.generation++;
		this.currentItem = item;
		this.currentOptions = options ?? {};
	}

	onEvent(event: CoreEvent): boolean | void {
		if (event.type !== 'ended' || !this.currentItem?.playback.loop) {
			return;
		}
		const item = this.currentItem;
		const generation = ++this.generation;
		const options: PlaybackOptions = {
			...this.currentOptions,
			autoplay: true,
			startPositionMs: 0
		};
		queueMicrotask(() => {
			if (generation !== this.generation) {
				return;
			}
			void this.options.open(item, options).catch(() => {
				this.options.dispatcher.dispatch('player-recovery-failed', {reason: 'playback-is-not-available'});
			});
		});
		return true;
	}

	shutdown(): void {
		this.generation++;
		this.currentItem = null;
		this.currentOptions = {};
	}
}
