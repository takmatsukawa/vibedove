// Basic slugify per spec: lowercase, spaces->-, keep [a-z0-9-], drop others
export function slugify(input: string, maxLen = 50): string {
  const lower = input.toLowerCase();
  const replaced = lower.replace(/\s+/g, '-');
  const filtered = replaced.replace(/[^a-z0-9-]/g, '');
  // collapse multiple dashes
  const collapsed = filtered.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return collapsed.slice(0, maxLen) || 'task';
}

