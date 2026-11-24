const AVATAR_TONES = 8;

/** "Priya Sharma" → "PS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A stable tone per name (1–8), so the same person always gets the same avatar colour. */
export function avatarTone(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return (Math.abs(hash) % AVATAR_TONES) + 1;
}
