// Uploaded member images belong to the API origin, which may differ from Next.
export function memberImageUrl(
  path: string | null | undefined,
  fallback: string,
) {
  if (!path?.trim()) return fallback;
  try {
    const base =
      process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim();
    const url = new URL(path.trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}
