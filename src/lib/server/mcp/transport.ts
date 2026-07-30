import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export class StatelessTransport implements Transport {
	onmessage?: (message: JSONRPCMessage, extra?: unknown) => void;
	onclose?: () => void;
	onerror?: (error: Error) => void;
	sessionId?: string;

	private pending?: (message: JSONRPCMessage) => void;

	async start(): Promise<void> {}

	async close(): Promise<void> {
		this.onclose?.();
	}

	async send(message: JSONRPCMessage): Promise<void> {
		if (this.pending && 'id' in message) {
			const resolve = this.pending;
			this.pending = undefined;
			resolve(message);
		}
	}

	handle(message: JSONRPCMessage): Promise<JSONRPCMessage | null> {
		const isRequest =
			typeof (message as { method?: unknown }).method === 'string' &&
			(message as { id?: unknown }).id !== undefined &&
			(message as { id?: unknown }).id !== null;

		if (!isRequest) {
			this.onmessage?.(message);
			return Promise.resolve(null);
		}

		return new Promise<JSONRPCMessage | null>((resolve) => {
			const timer = setTimeout(() => {
				if (this.pending) {
					this.pending = undefined;
					resolve({
						jsonrpc: '2.0',
						id: (message as { id: string | number }).id,
						error: { code: -32000, message: 'request timed out' }
					} as JSONRPCMessage);
				}
			}, 60_000);
			this.pending = (m) => {
				clearTimeout(timer);
				resolve(m);
			};
			this.onmessage?.(message);
		});
	}
}
