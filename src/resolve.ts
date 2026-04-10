import { MAX_BASE64_SIZE, MAX_FETCH_SIZE } from './constants.js';

export class ConvertInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConvertInputError';
  }
}

function isPrivateUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;

  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
  }

  return false;
}

export async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (isPrivateUrl(url)) {
    throw new ConvertInputError('Fetching from private/internal addresses is not allowed');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      throw new ConvertInputError(`HTTP ${res.status} fetching image`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) {
      throw new ConvertInputError(`Expected image content-type, got "${ct}"`);
    }

    const cl = res.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_FETCH_SIZE) {
      throw new ConvertInputError(`Image too large (max ${MAX_FETCH_SIZE / 1024 / 1024} MB)`);
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new ConvertInputError('Failed to read response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_FETCH_SIZE) {
        reader.cancel();
        throw new ConvertInputError(`Image too large (max ${MAX_FETCH_SIZE / 1024 / 1024} MB)`);
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
  }
}

export function decodeBase64Image(input: string): Buffer {
  const base64 = input.replace(/^data:image\/[^;]+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) {
    throw new ConvertInputError('Empty base64 image data');
  }
  if (buf.length > MAX_BASE64_SIZE) {
    throw new ConvertInputError(`Image exceeds ${MAX_BASE64_SIZE / 1024 / 1024} MB limit`);
  }
  return buf;
}

export async function resolveImageInput(source: string): Promise<Buffer> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return fetchImageBuffer(source);
  }
  return decodeBase64Image(source);
}
