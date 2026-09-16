import { createPiece, decodePiece, encodePiece, type Piece, randomSeed } from './engine';

const KEY = 'p=';

export async function pieceFromLocation(): Promise<Piece> {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith(KEY)) {
    try {
      return await decodePiece(hash.slice(KEY.length));
    } catch {
      // A damaged link still lands on a playable piece.
    }
  }
  return createPiece(randomSeed());
}

let pending: ReturnType<typeof setTimeout> | null = null;

export function syncLocation(piece: Piece): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(async () => {
    const encoded = await encodePiece(piece);
    history.replaceState(null, '', `#${KEY}${encoded}`);
  }, 250);
}

export async function shareUrl(piece: Piece): Promise<string> {
  const encoded = await encodePiece(piece);
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ p: encoded }),
  });
  if (!res.ok) throw new Error(`share failed: ${res.status}`);
  const { slug } = (await res.json()) as { slug: string };
  return `${location.origin}/s/${slug}`;
}
