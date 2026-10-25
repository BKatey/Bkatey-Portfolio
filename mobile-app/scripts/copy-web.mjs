// Copies the website version (../crossword) into www/ for the app and adds Capacitor's
// runtime script, which lets the page call native plugins such as text-to-speech.
import { cpSync, copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "crossword");
const out = join(root, "www");

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: path => !path.endsWith("sw.js") });
copyFileSync(join(root, "node_modules", "@capacitor", "core", "dist", "capacitor.js"), join(out, "capacitor.js"));

const indexPath = join(out, "index.html");
const html = readFileSync(indexPath, "utf8");
const marker = '<script src="words.js"></script>';
if (!html.includes(marker)) throw new Error("Could not find the words.js script tag in index.html");
writeFileSync(indexPath, html.replace(marker, '<script src="capacitor.js"></script>\n    ' + marker));

console.log("Copied the web app into www/");
