import type {
	VkAudioStream,
	VkError,
	VkInitConfig,
	VkObservable,
	VkPlayer,
	VkSubscription,
	VkValueObservable
} from '../../engines/vk/src/vk-player';

export class FakeValueSubject<T> implements VkValueObservable<T> {
	private readonly listeners = new Set<(value: T) => void>();

	constructor(private value: T) {}

	getValue(): T {
		return this.value;
	}

	setValue(value: T): void {
		this.value = value;
		for (const listener of this.listeners) {
			listener(value);
		}
	}

	subscribe(listener: (value: T) => void): VkSubscription {
		this.listeners.add(listener);
		return {unsubscribe: () => this.listeners.delete(listener)};
	}
}

export class FakeSubject<T> implements VkObservable<T> {
	private readonly listeners = new Set<(value: T) => void>();

	next(value: T): void {
		for (const listener of this.listeners) {
			listener(value);
		}
	}

	subscribe(listener: (value: T) => void): VkSubscription {
		this.listeners.add(listener);
		return {unsubscribe: () => this.listeners.delete(listener)};
	}
}

export class FakeVkPlayer implements VkPlayer {
	readonly info = {
		position$: new FakeValueSubject(0),
		duration$: new FakeValueSubject(60),
		muted$: new FakeValueSubject(false),
		volume$: new FakeValueSubject(1),
		availableQualities$: new FakeValueSubject(['360p', '720p', '1080p']),
		currentQuality$: new FakeValueSubject<string | undefined>('720p'),
		isAutoQualityEnabled$: new FakeValueSubject(true),
		availableAudioStreams$: new FakeValueSubject<VkAudioStream[]>([
			{id: 'ru', label: 'Russian', language: 'ru'},
			{id: 'en', label: 'English', language: 'en'}
		]),
		currentAudioStream$: new FakeValueSubject<VkAudioStream | undefined>({id: 'ru', label: 'Russian'}),
		availableTextTracks$: new FakeValueSubject([{id: 'en', label: 'English', language: 'en'}]),
		currentTextTrack$: new FakeValueSubject<string | undefined>(undefined),
		currentPlaybackRate$: new FakeValueSubject(1),
		videoBitrate$: new FakeValueSubject<number | undefined>(2500),
		isLive$: new FakeValueSubject<boolean | undefined>(false),
		isBuffering$: new FakeValueSubject(false)
	};
	readonly events = {
		canplay$: new FakeSubject<number>(),
		playing$: new FakeSubject<void>(),
		paused$: new FakeSubject<void>(),
		stopped$: new FakeSubject<void>(),
		ended$: new FakeSubject<void>(),
		willSeek$: new FakeSubject<unknown>(),
		seeked$: new FakeSubject<void>(),
		firstBytes$: new FakeSubject<number>(),
		firstFrame$: new FakeSubject<number>(),
		fatalError$: new FakeSubject<VkError>()
	};
	autoCanplay = true;
	playCalls = 0;
	destroyCalls = 0;
	lastSeekSeconds: number | null = null;
	initConfig: VkInitConfig | null = null;

	constructor(_config?: Record<string, unknown>) {}

	initVideo(config: VkInitConfig): this {
		this.initConfig = config;
		return this;
	}

	prepare(): this {
		if (this.autoCanplay) {
			this.events.canplay$.next(0);
		}
		return this;
	}

	play(): this {
		this.playCalls++;
		this.events.playing$.next();
		return this;
	}

	pause(): this {
		this.events.paused$.next();
		return this;
	}

	stop(): this {
		this.events.stopped$.next();
		return this;
	}

	destroy(): void {
		this.destroyCalls++;
	}

	seekTime(seconds: number): this {
		this.lastSeekSeconds = seconds;
		this.events.willSeek$.next({});
		this.info.position$.setValue(Math.abs(seconds));
		this.events.seeked$.next();
		return this;
	}

	setQuality(quality: string): this {
		this.info.currentQuality$.setValue(quality);
		return this;
	}

	setAutoQuality(enabled: boolean): this {
		this.info.isAutoQualityEnabled$.setValue(enabled);
		return this;
	}

	setAudioStream(stream: VkAudioStream): this {
		this.info.currentAudioStream$.setValue(stream);
		return this;
	}

	selectTextTrack(trackId: string | undefined): this {
		this.info.currentTextTrack$.setValue(trackId);
		return this;
	}

	setPlaybackRate(rate: number): this {
		this.info.currentPlaybackRate$.setValue(rate);
		return this;
	}

	setVolume(volume: number): this {
		this.info.volume$.setValue(volume);
		return this;
	}

	setMuted(muted: boolean): this {
		this.info.muted$.setValue(muted);
		return this;
	}
}
