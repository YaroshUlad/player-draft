import type {
	AdapterFactory,
	CommandInitiator,
	CoreOpenRequest,
	PlaybackAdapter,
	PlaybackSnapshot,
	PlaybackState,
	Unsubscribe
} from '../../contracts/src/playback';

export class PlaybackSession {
	readonly id: string;
	readonly mediaEpoch: number;
	readonly request: CoreOpenRequest;
	readonly adapter: PlaybackAdapter;
	state: PlaybackState = 'loading';
	operationId: string;
	initiator: CommandInitiator = 'sdk';
	unsubscribe: Unsubscribe | null = null;

	constructor(id: string, mediaEpoch: number, request: CoreOpenRequest, factory: AdapterFactory) {
		this.id = id;
		this.mediaEpoch = mediaEpoch;
		this.request = request;
		this.operationId = request.operationId;
		this.adapter = factory.create(request.source, request.capabilities);
	}

	getSnapshot(): PlaybackSnapshot {
		const technical = this.adapter.getTechnicalSnapshot();
		return {
			sessionId: this.id,
			mediaEpoch: this.mediaEpoch,
			state: this.state,
			positionMs: technical.positionMs,
			durationMs: technical.durationMs,
			live: {
				isLive: technical.live.isLive,
				offsetMs: technical.live.offsetMs,
				seekableRanges: [...technical.live.seekableRanges]
			},
			source: {...this.request.source},
			engine: {...technical.engine},
			quality: {
				requested: technical.quality.requested,
				current: technical.quality.current,
				isAuto: technical.quality.isAuto,
				bitrate: technical.quality.bitrate,
				available: [...technical.quality.available]
			},
			audioTracks: [...technical.audioTracks],
			textTracks: [...technical.textTracks],
			playbackRate: technical.playbackRate,
			volume: technical.volume,
			muted: technical.muted,
			capabilities: {...technical.capabilities}
		};
	}
}
