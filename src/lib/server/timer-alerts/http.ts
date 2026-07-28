import { error } from '@sveltejs/kit';
import { TimerAlertServiceError } from './service';

export function throwTimerAlertHttpError(cause: unknown): never {
	if (cause instanceof TimerAlertServiceError) {
		error(
			cause.code === 'not_found'
				? 404
				: cause.code === 'rate_limited'
					? 429
					: cause.code === 'unavailable'
						? 503
						: 400,
			cause.message
		);
	}
	throw cause;
}
