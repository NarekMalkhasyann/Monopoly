// Password hashing (scrypt) and signed tokens (JWT HS256) using only node:crypto.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export function hashPassword(password) {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64);
	return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
	const [saltHex, hashHex] = String(stored).split(':');
	if (!saltHex || !hashHex) return false;
	const expected = Buffer.from(hashHex, 'hex');
	const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
	return timingSafeEqual(expected, actual);
}

const b64 = (b) => Buffer.from(b).toString('base64url');

export function signToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
	const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
	const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
	return `${header}.${body}.${sig}`;
}

export function verifyToken(token, secret) {
	const parts = String(token || '').split('.');
	if (parts.length !== 3) return null;
	const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
	const given = Buffer.from(parts[2], 'base64url');
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
	try {
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
		return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
	} catch {
		return null;
	}
}
