export type PageAccessLevel = "view" | "edit";
export type PagePermissions = Record<string, PageAccessLevel>;

/**
 * Parses the user's `allowedPages` column.
 * - `null`/`undefined` raw value => unrestricted (admin or legacy users with full access)
 * - legacy array format `["materials", ...]` => each page gets "edit" access
 * - new object format `{ materials: "edit", invoices: "view" }`
 */
export function parseUserPagePermissions(allowedPagesRaw: string | null | undefined): PagePermissions | null {
  if (!allowedPagesRaw) return null;
  try {
    const parsed = JSON.parse(allowedPagesRaw);
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((k: string) => [k, "edit" as const]));
    }
    return parsed as PagePermissions;
  } catch {
    return null;
  }
}

/** Returns the access level for a page, or null if not accessible. `permissions === null` means unrestricted (full edit). */
export function getPageAccess(permissions: PagePermissions | null, pageKey: string): PageAccessLevel | null {
  if (permissions === null) return "edit";
  return permissions[pageKey] ?? null;
}
