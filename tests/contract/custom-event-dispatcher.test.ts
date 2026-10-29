import {describe, expect, it} from 'vitest';
import {CustomEventDispatcher} from '../../packages/sdk/src/custom-event-dispatcher';

describe('CustomEventDispatcher', () => {
	it('dispatches typed detail on the provided target', () => {
		const target = new EventTarget();
		const dispatcher = new CustomEventDispatcher(target);
		let detail: unknown;
		target.addEventListener('player-time-update', (event) => {
			detail = (event as CustomEvent).detail;
		});

		dispatcher.dispatch('player-time-update', {time: 1234});

		expect(detail).toEqual({time: 1234});
	});
});
