declare global {
	namespace App {
		interface Locals {
			user: {
				username: string;
				displayName: string;
				/** Full DNs (or CNs) of LDAP groups the user belongs to. Empty if login was not LDAP-backed. */
				ldapGroups?: string[];
				/** `groups` claim values from the OIDC provider. Empty if login was not OIDC-backed. */
				oidcGroups?: string[];
				/** Platform super-user. Bypasses every workspace gate. */
				isPlatformAdmin?: boolean;
			} | null;
		}
	}
}

export {};
