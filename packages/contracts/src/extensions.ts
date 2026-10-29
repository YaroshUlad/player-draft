import type {CoreEvent, Source} from './playback';
import type {PlaylistItem} from './playlist-item';
import type {PlaybackOptions} from './public-api';

export interface OpenExtensionContext {
	item: PlaylistItem;
	options: PlaybackOptions;
	source: Source;
}

export type NextOpen = (source: Source, startPositionMs?: number) => Promise<void>;

export interface PlayerExtension {
	readonly name: string;
	init?(): Promise<void> | void;
	beforeOpen?(item: PlaylistItem, options?: PlaybackOptions): Promise<void> | void;
	aroundOpen?(context: OpenExtensionContext, next: NextOpen): Promise<void>;
	onEvent?(event: CoreEvent): boolean | void;
	shutdown?(): Promise<void> | void;
	dispose?(): Promise<void> | void;
}
