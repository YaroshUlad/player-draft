import type {PublicEventMap, PublicEventName} from '../../contracts/src/public-events';

export class CustomEventDispatcher {
	constructor(private readonly target: EventTarget) {}

	dispatch<K extends PublicEventName>(
		name: K,
		...args: PublicEventMap[K] extends undefined ? [] : [PublicEventMap[K]]
	): void {
		const detail = args[0];
		let event: CustomEvent;

		try {
			event = detail === undefined ? new CustomEvent(name) : new CustomEvent(name, {detail});
		} catch {
			if (typeof document === 'undefined') {
				throw new Error('CustomEvent constructor is not supported in this environment');
			}
			event = document.createEvent('CustomEvent');
			event.initCustomEvent(name, false, false, detail);
		}

		this.target.dispatchEvent(event);
	}
}
