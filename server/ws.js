// Minimal WebSocket server (RFC 6455) on top of node:http "upgrade" - no packages needed.
// Supports text messages, ping/pong, close and fragmented messages, which is all the
// game uses. Browsers talk to it with the built-in WebSocket class.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;

export class Connection extends EventEmitter {
	constructor(socket) {
		super();
		this.socket = socket;
		this.buffer = Buffer.alloc(0);
		this.fragments = [];
		this.closed = false;
		this.alive = true;
		socket.on('data', (chunk) => this.#onData(chunk));
		socket.on('close', () => this.#finish());
		socket.on('error', () => this.#finish());
	}

	#finish() {
		if (this.closed) return;
		this.closed = true;
		this.emit('close');
	}

	#onData(chunk) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const buf = this.buffer;
			if (buf.length < 2) return;
			const fin = (buf[0] & 0x80) !== 0;
			const opcode = buf[0] & 0x0f;
			const masked = (buf[1] & 0x80) !== 0;
			let len = buf[1] & 0x7f;
			let offset = 2;
			if (len === 126) {
				if (buf.length < 4) return;
				len = buf.readUInt16BE(2);
				offset = 4;
			} else if (len === 127) {
				if (buf.length < 10) return;
				const big = buf.readBigUInt64BE(2);
				if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
				len = Number(big);
				offset = 10;
			}
			if (!masked) return this.close(1002); // clients must mask
			if (len > MAX_MESSAGE) return this.close(1009);
			if (buf.length < offset + 4 + len) return;
			const mask = buf.subarray(offset, offset + 4);
			const payload = Buffer.from(buf.subarray(offset + 4, offset + 4 + len));
			for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
			this.buffer = buf.subarray(offset + 4 + len);

			if (opcode === 0x8) { this.close(1000); return; }
			if (opcode === 0x9) { this.#frame(0xa, payload); continue; }
			if (opcode === 0xa) { this.alive = true; continue; }
			if (opcode === 0x1 || opcode === 0x0) {
				this.fragments.push(payload);
				if (this.fragments.reduce((n, f) => n + f.length, 0) > MAX_MESSAGE) return this.close(1009);
				if (fin) {
					const text = Buffer.concat(this.fragments).toString('utf8');
					this.fragments = [];
					this.emit('message', text);
				}
			}
			// binary frames (0x2) are ignored
		}
	}

	#frame(opcode, payload) {
		if (this.closed || this.socket.destroyed) return;
		let header;
		if (payload.length < 126) {
			header = Buffer.from([0x80 | opcode, payload.length]);
		} else if (payload.length < 65536) {
			header = Buffer.alloc(4);
			header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2);
		} else {
			header = Buffer.alloc(10);
			header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
		}
		this.socket.write(Buffer.concat([header, payload]));
	}

	send(text) { this.#frame(0x1, Buffer.from(text)); }
	ping() { this.alive = false; this.#frame(0x9, Buffer.alloc(0)); }

	close(code = 1000) {
		if (this.closed) return;
		const body = Buffer.alloc(2);
		body.writeUInt16BE(code);
		this.#frame(0x8, body);
		this.socket.end();
		this.#finish();
	}
}

// Completes the handshake and returns the Connection (or null if it is not a valid request).
export function acceptUpgrade(req, socket) {
	const key = req.headers['sec-websocket-key'];
	if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) {
		socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
		return null;
	}
	const accept = createHash('sha1').update(key + GUID).digest('base64');
	socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
	socket.setNoDelay(true);
	return new Connection(socket);
}

// Pings every connection regularly and drops the ones that stopped answering.
export function startHeartbeat(getConnections, everyMs = 25000) {
	const timer = setInterval(() => {
		for (const c of getConnections()) {
			if (!c.alive) { c.close(1001); continue; }
			c.ping();
		}
	}, everyMs);
	timer.unref();
	return () => clearInterval(timer);
}
