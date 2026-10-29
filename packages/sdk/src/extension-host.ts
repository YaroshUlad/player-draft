import type {NextOpen, OpenExtensionContext, PlayerExtension} from '../../contracts/src/extensions';
import type {CoreEvent, Source} from '../../contracts/src/playback';
import type {PlaylistItem} from '../../contracts/src/playlist-item';
import type {PlaybackOptions} from '../../contracts/src/public-api';
import type {PlaybackCore} from '../../core/src/playback-core';

export class ExtensionHost {
	constructor(
		core: PlaybackCore,
		private readonly extensions: readonly PlayerExtension[],
		private readonly onError: (error: unknown, extension: PlayerExtension) => void = (error, extension) => {
			console.error(`Player extension ${extension.name} failed`, error);
		}
	) {
		core.subscribe((event) => this.onCoreEvent(event));
	}

	async init(): Promise<void> {
		for (const extension of this.extensions) {
			await extension.init?.();
		}
	}

	async beforeOpen(item: PlaylistItem, options?: PlaybackOptions): Promise<void> {
		for (const extension of this.extensions) {
			await extension.beforeOpen?.(item, options);
		}
	}

	async open(
		item: PlaylistItem,
		options: PlaybackOptions,
		source: Source,
		openSource: NextOpen
	): Promise<void> {
		const orchestrators = this.extensions.filter((extension) => extension.aroundOpen);
		const invoke = async (index: number, nextSource: Source, startPositionMs?: number): Promise<void> => {
			const orchestrator = orchestrators[index];
			if (!orchestrator?.aroundOpen) {
				await openSource(nextSource, startPositionMs);
				return;
			}
			const context: OpenExtensionContext = {
				item,
				options: {
					...options,
					...(startPositionMs !== undefined ? {startPositionMs} : {})
				},
				source: nextSource
			};
			await orchestrator.aroundOpen(context, (source, position) => invoke(index + 1, source, position));
		};
		await invoke(0, source);
	}

	async shutdown(): Promise<void> {
		for (const extension of [...this.extensions].reverse()) {
			await extension.shutdown?.();
		}
	}

	async dispose(): Promise<void> {
		for (const extension of [...this.extensions].reverse()) {
			await extension.dispose?.();
		}
	}

	private onCoreEvent(event: CoreEvent): void {
		for (const extension of this.extensions) {
			try {
				const stopPropagation = extension.onEvent?.(event);
				if (stopPropagation === true) {
					break;
				}
			} catch (error) {
				this.onError(error, extension);
			}
		}
	}
}
