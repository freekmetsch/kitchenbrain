const ORIGIN = 'https://household-brain-production.up.railway.app';

if (process.argv.includes('--validate-only')) {
	process.stdout.write('PRODUCTION-AUTH-CANARY-VALID\n');
	process.exit(0);
}

const account = process.argv.length === 4 && process.argv[2] === '--account' ? process.argv[3] : '';
const config =
	account === 'freek'
		? {
				username: 'freek',
				current: process.env.HOUSEHOLD_BRAIN_FREEK_PASSWORD,
				previous: process.env.HOUSEHOLD_BRAIN_OLD_FREEK_PASSWORD
			}
		: account === 'ylfa'
			? {
					username: 'ylfa',
					current: process.env.HOUSEHOLD_BRAIN_YLFA_PASSWORD,
					previous: process.env.HOUSEHOLD_BRAIN_OLD_YLFA_PASSWORD
				}
			: null;

async function attempt(username, password) {
	const response = await fetch(`${ORIGIN}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			origin: ORIGIN,
			referer: `${ORIGIN}/login`
		},
		body: new URLSearchParams({ username, password })
	});
	return response.status;
}

try {
	if (
		!config ||
		!config.current ||
		!config.previous ||
		config.current === config.previous
	) {
		throw new Error('invalid canary inputs');
	}

	const currentStatus = await attempt(config.username, config.current);
	const previousStatus = await attempt(config.username, config.previous);
	if (currentStatus !== 303 || previousStatus !== 400) {
		throw new Error('unexpected authentication result');
	}
	process.stdout.write(`PRODUCTION-AUTH-CANARY-SUCCESS:${account}\n`);
} catch {
	process.stderr.write('PRODUCTION-AUTH-CANARY-ERROR\n');
	process.exitCode = 1;
} finally {
	if (config) {
		config.current = null;
		config.previous = null;
	}
}
