const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function shortId(length = 7): string {
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

