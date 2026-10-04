export function reconcileClaimSelection(selectedIds: Set<string>, visibleIds: string[]): Set<string> {
  const visible = new Set(visibleIds);
  return new Set([...selectedIds].filter((id) => visible.has(id)));
}

export function toggleVisibleClaimSelection(selectedIds: Set<string>, visibleIds: string[]): Set<string> {
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  return allVisibleSelected ? new Set() : new Set(visibleIds);
}

export function getSelectedVisibleClaims<T extends { id: string }>(claims: T[], selectedIds: Set<string>): T[] {
  return claims.filter((claim) => selectedIds.has(claim.id));
}
