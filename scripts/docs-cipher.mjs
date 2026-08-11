#!/usr/bin/env node
// docs-cipher: reversible obfuscation + integrity bundling for docs/docs.
//
// Commands:
//   node scripts/docs-cipher.mjs pack    encode docs/docs -> docs/docs.bundle.zip
//   node scripts/docs-cipher.mjs unpack  decode docs/docs.bundle.zip -> docs/docs
//
// Security model (by design, NOT cryptographic secrecy):
//   The algorithm and SALT live in this file, so anyone with the repo can
//   decode. This is high-strength obfuscation, not encryption. What IS strong
//   here is integrity: every file's plaintext SHA-256 is recorded in a
//   manifest and re-verified on unpack; any tampering or corruption aborts.
//
// Per-file transform (reversible):
//   plaintext bytes
//     -> XOR with a SHA-256 keystream seeded by (SALT + relative path)
//     -> byte substitution via a 256-entry permutation seeded by the same hash
//     -> base64
//   decode applies the exact inverse and then checks SHA-256.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(ROOT, "docs", "docs");
const BUNDLE = join(ROOT, "docs", "docs.bundle.zip");
const SALT = "swifty-docs-cipher-v1::do-not-treat-as-secret";
const MANIFEST_VERSION = 1;

function sha256(buf) {
  return createHash("sha256").update(buf).digest();
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// Deterministic per-file seed from the relative path.
function seedFor(relPath) {
  return sha256(Buffer.from(SALT + "::" + relPath));
}

// SHA-256 counter-mode keystream, long enough for `len` bytes.
function keystream(seed, len) {
  const out = Buffer.alloc(len);
  let written = 0;
  let counter = 0;
  while (written < len) {
    const block = sha256(Buffer.concat([seed, Buffer.from("::ks::" + counter)]));
    const n = Math.min(block.length, len - written);
    block.copy(out, written, 0, n);
    written += n;
    counter += 1;
  }
  return out;
}

// Deterministic 256-entry permutation (Fisher-Yates driven by SHA-256).
function permutation(seed) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let counter = 0;
  for (let i = 255; i > 0; i -= 1) {
    const h = sha256(Buffer.concat([seed, Buffer.from("::perm::" + counter)]));
    counter += 1;
    const j = h.readUInt32BE(0) % (i + 1);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  const inv = new Array(256);
  for (let i = 0; i < 256; i += 1) inv[perm[i]] = i;
  return { perm, inv };
}

function encodeBytes(plain, relPath) {
  const seed = seedFor(relPath);
  const ks = keystream(seed, plain.length);
  const { perm } = permutation(seed);
  const out = Buffer.alloc(plain.length);
  for (let i = 0; i < plain.length; i += 1) {
    out[i] = perm[plain[i] ^ ks[i]];
  }
  return Buffer.from(out.toString("base64"), "utf8");
}

function decodeBytes(encoded, relPath) {
  const raw = Buffer.from(encoded.toString("utf8"), "base64");
  const seed = seedFor(relPath);
  const ks = keystream(seed, raw.length);
  const { inv } = permutation(seed);
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = inv[raw[i]] ^ ks[i];
  }
  return out;
}

function walk(dir, base, acc) {
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, base, acc);
    } else if (st.isFile()) {
      acc.push(relative(base, full).split("\\").join("/"));
    }
  }
  return acc;
}

function pack() {
  if (!existsSync(DOCS_DIR)) {
    console.error("[docs-cipher] docs/docs not found; nothing to pack.");
    process.exit(1);
  }
  const rels = walk(DOCS_DIR, DOCS_DIR, []).sort();
  if (rels.length === 0) {
    console.error("[docs-cipher] docs/docs is empty; nothing to pack.");
    process.exit(1);
  }

  const zip = new AdmZip();
  const manifest = { version: MANIFEST_VERSION, files: {} };

  for (const rel of rels) {
    const plain = readFileSync(join(DOCS_DIR, rel));
    manifest.files[rel] = { sha256: sha256Hex(plain), size: plain.length };
    zip.addFile(rel + ".enc", encodeBytes(plain, rel));
  }

  const manifestJson = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  zip.addFile("manifest.json", manifestJson);
  zip.writeZip(BUNDLE);

  console.log(`[docs-cipher] packed ${rels.length} file(s) -> ${relative(ROOT, BUNDLE)}`);
}

function unpack() {
  if (!existsSync(BUNDLE)) {
    // Bundle may simply not exist yet (docs never packed). Don't break install.
    console.log("[docs-cipher] no bundle found; skipping unpack.");
    return;
  }

  // Guard: never clobber an existing, populated docs/docs (local edits win).
  if (existsSync(DOCS_DIR) && walk(DOCS_DIR, DOCS_DIR, []).length > 0) {
    console.log("[docs-cipher] docs/docs already populated; skipping unpack to protect local content.");
    return;
  }

  const zip = new AdmZip(BUNDLE);
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) {
    console.error("[docs-cipher] manifest.json missing from bundle; aborting.");
    process.exit(1);
  }
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  if (manifest.version !== MANIFEST_VERSION) {
    console.error(`[docs-cipher] unsupported manifest version ${manifest.version}; aborting.`);
    process.exit(1);
  }

  const rels = Object.keys(manifest.files).sort();
  const decoded = [];
  for (const rel of rels) {
    const entry = zip.getEntry(rel + ".enc");
    if (!entry) {
      console.error(`[docs-cipher] missing encoded entry for ${rel}; aborting.`);
      process.exit(1);
    }
    const plain = decodeBytes(entry.getData(), rel);
    const digest = sha256Hex(plain);
    if (digest !== manifest.files[rel].sha256) {
      console.error(`[docs-cipher] integrity check FAILED for ${rel}`);
      console.error(`  expected ${manifest.files[rel].sha256}`);
      console.error(`  got      ${digest}`);
      console.error("Aborting; no files were written.");
      process.exit(1);
    }
    decoded.push({ rel, plain });
  }

  // All verified before writing anything, so a failure leaves no partial tree.
  for (const { rel, plain } of decoded) {
    const dest = join(DOCS_DIR, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, plain);
  }

  console.log(`[docs-cipher] unpacked ${decoded.length} file(s), all SHA-256 verified -> ${relative(ROOT, DOCS_DIR)}`);
}

const cmd = process.argv[2];
if (cmd === "pack") pack();
else if (cmd === "unpack") unpack();
else {
  console.error("usage: node scripts/docs-cipher.mjs <pack|unpack>");
  process.exit(1);
}
