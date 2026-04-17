declare global {
	namespace App {
		interface Locals {
			user: { username: string; displayName: string } | null;
		}
	}
}

export {};
