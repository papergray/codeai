#!/usr/bin/env node
// generate-icons.js — converts public/icon.svg to all Android mipmap sizes
// Run after `npx cap add android` to patch the icons

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const SIZES = [
  { dir: "mipmap-mdpi",    size: 48  },
  { dir: "mipmap-hdpi",    size: 72  },
  { dir: "mipmap-xhdpi",   size: 96  },
  { dir: "mipmap-xxhdpi",  size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];

// Adaptive icon foreground (larger, no background)
const ADAPTIVE = [
  { dir: "mipmap-mdpi",    size: 108 },
  { dir: "mipmap-hdpi",    size: 162 },
  { dir: "mipmap-xhdpi",   size: 216 },
  { dir: "mipmap-xxhdpi",  size: 324 },
  { dir: "mipmap-xxxhdpi", size: 432 },
];

const SRC = path.resolve(__dirname, "../public/icon.svg");
const RES = path.resolve(__dirname, "../android/app/src/main/res");

// Check if sharp is available, otherwise try ImageMagick
let useSharp = false;
try {
  require.resolve("sharp");
  useSharp = true;
} catch {}

async function generateWithSharp() {
  const sharp = require("sharp");
  for (const { dir, size } of SIZES) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(SRC).resize(size, size).png().toFile(path.join(outDir, "ic_launcher.png"));
    await sharp(SRC).resize(size, size).png().toFile(path.join(outDir, "ic_launcher_round.png"));
    console.log(`✓ ${dir} (${size}px)`);
  }
  for (const { dir, size } of ADAPTIVE) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(SRC).resize(size, size).png().toFile(path.join(outDir, "ic_launcher_foreground.png"));
  }
}

function generateWithImageMagick() {
  for (const { dir, size } of SIZES) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    execSync(`convert -background none "${SRC}" -resize ${size}x${size} "${path.join(outDir, "ic_launcher.png")}"`);
    execSync(`convert -background none "${SRC}" -resize ${size}x${size} "${path.join(outDir, "ic_launcher_round.png")}"`);
    console.log(`✓ ${dir} (${size}px)`);
  }
  for (const { dir, size } of ADAPTIVE) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    execSync(`convert -background none "${SRC}" -resize ${size}x${size} "${path.join(outDir, "ic_launcher_foreground.png")}"`);
  }
}

(async () => {
  console.log("🎨 Generating Android icons from icon.svg...");
  if (!fs.existsSync(SRC)) { console.error("❌ icon.svg not found at", SRC); process.exit(1); }
  if (!fs.existsSync(RES)) { console.error("❌ Android res dir not found. Run `npx cap add android` first."); process.exit(1); }

  try {
    if (useSharp) {
      await generateWithSharp();
    } else {
      generateWithImageMagick();
    }
    console.log("✅ All icons generated!");
  } catch (e) {
    console.error("❌ Icon generation failed:", e.message);
    console.log("💡 Try: npm install sharp  OR  install ImageMagick (brew install imagemagick)");
  }
})();
