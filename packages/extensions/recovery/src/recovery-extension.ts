import type {NextOpen, OpenExtensionContext, PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent, DeviceCapabilities, Source} from '../../../contracts/src/playback';
import type {PlaylistItem} from '../../../contracts/src/playlist-item';
import type {PlaybackOptions} from '../../../contracts/src/public-api';
import type {SourcePlanner} from '../../../core/src/source-planner';
import type {CustomEventDispatcher} from '../../../sdk/src/custom-event-dispatcher';

export interface RecoveryExtensionOptions {
	sourcePlanner: SourcePlanner;
	getCapabilities: () => DeviceCapabilities;
	dispatcher: CustomEventDispatcher;
}

interface RecoveryFlow {
	item: PlaylistItem;
	options: PlaybackOptions;
	candidates: Source[];
	index: number;
	next: NextOpen;
}

export class RecoveryExtension implements PlayerExtension {
	readonly name = 'recovery';
	private activeFlow: RecoveryFlow | null = null;
	private opening = false;
	private recovering = false;
	private generation = 0;
	private lastPositionMs = 0;

	constructor(private readonly options: RecoveryExtensionOptions) {}

	async aroundOpen(context: OpenExtensionContext, next: NextOpen): Promise<void> {
		const planned = this.options.sourcePlanner.plan(context.item.model.files, this.options.getCapabilities());
		const candidates = [
			context.source,
			...planned.filter((source) => source.url !== context.source.url || source.variant !== context.source.variant)
		];
		let lastError: unknown = null;
		this.opening = true;
		this.generation++;
		this.lastPositionMs = context.options.startPositionMs ?? context.item.playback.startPosition ?? 0;

		try {
			for (let index = 0; index < candidates.length; index++) {
				const source = candidates[index];
				if (!source) {
					continue;
				}
				try {
					await next(source, this.lastPositionMs);
					this.activeFlow = {
						item: context.item,
						options: context.options,
						candidates,
						index,
						next
					};
					return;
				} catch (error) {
					if (this.isStaleOperation(error)) {
						throw error;
					}
					lastError = error;
				}
			}

			this.activeFlow = null;
			this.options.dispatcher.dispatch('player-recovery-failed', {reason: 'playback-is-not-available'});
			throw lastError ?? new Error('Playback is not available');
		} finally {
			this.opening = false;
		}
	}

	onEvent(event: CoreEvent): void {
		if (event.playbackKind !== 'content') {
			return;
		}
		if (event.type === 'timeUpdate') {
			this.lastPositionMs = event.positionMs;
			return;
		}
		if (event.type !== 'error' || this.opening || this.recovering) {
			return;
		}
		const flow = this.activeFlow;
		if (!flow) {
			return;
		}
		const generation = ++this.generation;
		this.recovering = true;
		void this.recover(flow, generation);
	}

	shutdown(): void {
		this.generation++;
		this.activeFlow = null;
		this.opening = false;
		this.recovering = false;
	}

	private async recover(flow: RecoveryFlow, generation: number): Promise<void> {
		let lastError: unknown = null;
		for (let index = flow.index + 1; index < flow.candidates.length; index++) {
			const source = flow.candidates[index];
			if (!source) {
				continue;
			}
			try {
				await flow.next(source, this.lastPositionMs);
				if (generation === this.generation) {
					this.activeFlow = {...flow, index};
					this.recovering = false;
				}
				return;
			} catch (error) {
				if (this.isStaleOperation(error)) {
					this.recovering = false;
					return;
				}
				lastError = error;
			}
		}

		if (generation === this.generation) {
			this.activeFlow = null;
			this.recovering = false;
			this.options.dispatcher.dispatch('player-recovery-failed', {
				reason: lastError ? 'recover-fail' : 'playback-is-not-available'
			});
		}
	}

	private isStaleOperation(error: unknown): boolean {
		return typeof error === 'object' && error !== null && 'code' in error && error.code === 'STALE_OPERATION';
	}
}
