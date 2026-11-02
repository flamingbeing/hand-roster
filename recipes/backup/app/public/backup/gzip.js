// The backup as a .json.gz file and back, with the browser's own gzip (CompressionStream; no library). Reads a plain
// .json too.

/** @param {ReadableWritablePair<Uint8Array, Uint8Array>} stream @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
async function through(stream, bytes) {
  return new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(stream)).arrayBuffer());
}
const isGzip = (/** @type {Uint8Array} */ b) => b[0] === 0x1f && b[1] === 0x8b;

/** @param {unknown} data @returns {Promise<Uint8Array>} */
export const packBackup = data => through(new CompressionStream('gzip'), new TextEncoder().encode(JSON.stringify(data)));

/** the JSON a .json.gz (or .json) file holds, or an error in plain words @param {Uint8Array} bytes @returns {Promise<unknown>} */
export async function unpackJson(bytes) {
  let text;
  try { text = new TextDecoder().decode(isGzip(bytes) ? await through(new DecompressionStream('gzip'), bytes) : bytes); } catch { throw new Error('That file can’t be opened (not a backup).'); }
  try { return JSON.parse(text); } catch { throw new Error('That isn’t a backup (not JSON).'); }
}
