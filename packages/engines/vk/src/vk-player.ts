export interface VkSubscription {
	unsubscribe(): void;
}

export interface VkObservable<T> {
	subscribe(listener: (value: T) => void): VkSubscription;
}

export interface VkValueObservable<T> extends VkObservable<T> {
	getValue(): T;
}

export interface VkError {
	message?: string;
	thrown?: Error;
}

export interface VkAudioStream {
	id: string;
	label?: string;
	language?: string;
	isDefault?: boolean;
}

export interface VkTextTrack {
	id: string;
	label?: string;
	language?: string;
	url?: string;
	isAuto?: boolean;
}

export interface VkSource {
	type: 'url';
	url: string;
	compatibilityMode: boolean;
}

export interface VkInitConfig {
	container: HTMLElement;
	sources: Record<string, VkSource>;
	failoverHosts?: string[];
	isMuted: boolean;
}

export interface VkPlayer {
	info: {
		position$: VkValueObservable<number>;
		duration$: VkValueObservable<number>;
		muted$: VkValueObservable<boolean>;
		volume$: VkValueObservable<number>;
		availableQualities$: VkValueObservable<string[]>;
		currentQuality$: VkValueObservable<string | undefined>;
		isAutoQualityEnabled$: VkValueObservable<boolean>;
		availableAudioStreams$: VkValueObservable<VkAudioStream[]>;
		currentAudioStream$: VkValueObservable<VkAudioStream | undefined>;
		availableTextTracks$: VkValueObservable<VkTextTrack[]>;
		currentTextTrack$: VkValueObservable<string | undefined>;
		currentPlaybackRate$: VkValueObservable<number>;
		videoBitrate$: VkValueObservable<number | undefined>;
		isLive$: VkValueObservable<boolean | undefined>;
		isBuffering$: VkValueObservable<boolean>;
	};
	events: {
		canplay$: VkObservable<number>;
		playing$: VkObservable<void>;
		paused$: VkObservable<void>;
		stopped$: VkObservable<void>;
		ended$: VkObservable<void>;
		willSeek$: VkObservable<unknown>;
		seeked$: VkObservable<void>;
		firstBytes$: VkObservable<number>;
		firstFrame$: VkObservable<number>;
		fatalError$: VkObservable<VkError>;
	};
	initVideo(config: VkInitConfig): VkPlayer;
	prepare(): VkPlayer;
	play(): VkPlayer;
	pause(): VkPlayer;
	stop(): VkPlayer;
	destroy(): void;
	seekTime(seconds: number): VkPlayer;
	setQuality(quality: string): VkPlayer;
	setAutoQuality(enabled: boolean): VkPlayer;
	setAudioStream(stream: VkAudioStream): VkPlayer;
	selectTextTrack(trackId: string | undefined): VkPlayer;
	setPlaybackRate(rate: number): VkPlayer;
	setVolume(volume: number): VkPlayer;
	setMuted(muted: boolean, forced?: boolean): VkPlayer;
}

export interface VkPlayerConstructor {
	new(config?: Record<string, unknown>): VkPlayer;
}

interface VkWindow extends Window {
	VKCore?: {Player: VkPlayerConstructor};
	initPlayerSdk?: () => void;
}

export function createGlobalVkPlayer(): VkPlayer {
	if (typeof window === 'undefined') {
		throw new Error('VKCore global is not present');
	}
	const vkCore = (window as unknown as VkWindow).VKCore;
	if (!vkCore) {
		throw new Error('VKCore global is not present');
	}
	return new vkCore.Player({});
}

export function initializeVkPlayerSdk(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}
	const vkWindow = window as unknown as VkWindow;
	if (vkWindow.VKCore) {
		return true;
	}
	if (!vkWindow.initPlayerSdk) {
		return false;
	}
	try {
		vkWindow.initPlayerSdk();
		return Boolean(vkWindow.VKCore);
	} catch {
		return false;
	}
}

export function isVkPlayerAvailable(): boolean {
	return typeof window !== 'undefined' && Boolean((window as unknown as VkWindow).VKCore);
}
