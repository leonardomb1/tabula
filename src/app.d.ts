declare global {
	namespace App {
		interface Locals {
			user?: import('$lib/server/auth').SessionUser;
			access?: import('$lib/server/access').Access;
		}

		/** What `handleError` returns; reaches the error page as `page.error`. */
		interface Error {
			message: string;
			/** Correlation id for an unexpected failure; absent on thrown HTTP errors. */
			id?: string;
		}
	}
}

export {};
