'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const archiver = require('archiver');

/**
 * Build a standard Bayou Social Pack.
 * Writes real files to a temp dir, zips them with streaming, and cleans up.
 *
 * @param {object} opts
 * @param {Buffer} opts.imageBuffer - final JPG/PNG bytes (already watermarked if applicable)
 * @param {string} opts.imageExt - "jpg" | "png"
 * @param {string} opts.altText
 * @param {string} opts.seoText
 * @param {string} opts.licenseText
 * @param {string} opts.readmeText
 * @returns {Promise<{zipPath:string, tmpDir:string, bytes:number}>}
 */
async function buildPackZip(opts) {
  const {
    imageBuffer,
    imageExt = 'jpg',
    altText = '',
    seoText = '',
    licenseText = '',
    readmeText = ''
  } = opts || {};

  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 50) {
    throw new Error('imageBuffer is missing or too small to be valid');
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bayou-pack-'));
  const outZip = path.join(tmpDir, 'bayou-social-pack.zip');

  // standard filenames
  const imgName = `image.${imageExt}`;
  const files = [
    { name: imgName, content: imageBuffer, isBinary: true },
    { name: 'alt-text.txt', content: altText, isBinary: false },
    { name: 'seo.txt', content: seoText, isBinary: false },
    { name: 'license.txt', content: licenseText, isBinary: false },
    { name: 'README.txt', content: readmeText, isBinary: false },
  ];

  // write files to disk first (makes the archive deterministic + easy to debug)
  for (const f of files) {
    const p = path.join(tmpDir, f.name);
    if (f.isBinary) {
      await fsp.writeFile(p, f.content);
    } else {
      await fsp.writeFile(p, String(f.content || '').trim() + '\n', 'utf8');
    }
  }

  // stream zip correctly
  const output = fs.createWriteStream(outZip);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);

  // add each file into the root of the zip
  for (const f of files) {
    archive.file(path.join(tmpDir, f.name), { name: f.name });
  }

  await archive.finalize();
  await done;

  const st = await fsp.stat(outZip);
  return { zipPath: outZip, tmpDir, bytes: st.size };
}

async function safeRm(dir) {
  try { await fsp.rm(dir, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { buildPackZip, safeRm };
