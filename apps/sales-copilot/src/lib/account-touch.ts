/**
 * Formerly bumped an account's `lastcontactedon` field.
 * That field has been removed from the Account model.
 * This function is now a no-op to avoid breaking callers.
 */
export async function touchAccountLastContacted(
  _accountId: string | undefined | null,
  _whenISO?: string,
): Promise<void> {
  // no-op — lastcontactedon field no longer exists
}
