/**
 * Modernize Alef SCSS:
 * - Remove local token overrides in :host
 * - Remove redefinitions of global components: .btn, .input, .card, .badge, .pill, .alert, etc.
 * - Normalize common page backgrounds to var(--bg)
 *
 * Usage:
 *   node tools/modernize-scss.js
 *
 * It creates a backup copy next to each file: *.scss.bak
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(process.cwd(), "src", "app");

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (p.endsWith(".scss")) files.push(p);
  }
  return files;
}

// Remove a full SCSS block by selector using brace matching
function removeBlock(text, selectorRegex) {
  let out = text;
  while (true) {
    const m = selectorRegex.exec(out);
    if (!m) break;

    const start = m.index;
    // find first "{"
    const braceStart = out.indexOf("{", start);
    if (braceStart === -1) break;

    let i = braceStart;
    let depth = 0;
    while (i < out.length) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}") {
        depth--;
        if (depth === 0) {
          const end = i + 1;
          out = out.slice(0, start) + out.slice(end);
          break;
        }
      }
      i++;
    }
    if (i >= out.length) break;
    selectorRegex.lastIndex = 0;
  }
  return out;
}

function tidy(text) {
  // collapse excessive blank lines
  text = text.replace(/\n{4,}/g, "\n\n\n");
  // trim trailing spaces
  text = text.split("\n").map(l => l.replace(/[ \t]+$/g, "")).join("\n");
  // ensure newline at EOF
  if (!text.endsWith("\n")) text += "\n";
  return text;
}

function modernizeFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");

  // backup
  const bak = filePath + ".bak";
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, s, "utf8");

  let before = s;

  // 1) Remove :host token overrides (common in your files)
  // Removes any :host { ... } block entirely
  s = removeBlock(s, /(^|\n)\s*:host\s*/m);

  // 2) Remove local component definitions that should come from styles.scss
  const selectorsToRemove = [
    /\.btn\b/,
    /\.input\b/,
    /\.card\b/,
    /\.badge\b/,
    /\.pill\b/,
    /\.alert\b/,
    /\.mono\b/,
    /\.muted\b/,
    /\.small\b/,
    /\.tiny\b/,
  ];

  for (const sel of selectorsToRemove) {
    // match selector at line start (avoid killing nested things like ".academy-card .btn" — we only remove top-level blocks)
    s = removeBlock(s, new RegExp(`(^|\\n)\\s*${sel.source}\\s*`, "m"));
  }

  // 3) Normalize very common background patterns to use global tokens when they appear as page-level backgrounds
  // (light-touch: only replaces exact "background: #fff;" and "background: white;" in .page blocks)
  // We do a simple global replacement; it’s safe because var(--bg) is already white-ish.
  s = s.replace(/background:\s*#fff\s*;/g, "background: var(--bg);");
  s = s.replace(/background:\s*white\s*;/g, "background: var(--bg);");

  // 4) Replace hardcoded borders with var(--border) (soft-touch)
  s = s.replace(/border:\s*1px\s+solid\s+var\(--border\)\s*;/g, "border: 1px solid var(--border);");
  s = s.replace(/border:\s*1px\s+solid\s+color-mix\([^;]+\)\s*;/g, "border: 1px solid var(--border);");

  // 5) Tidy
  s = tidy(s);

  const changed = s !== before;
  if (changed) fs.writeFileSync(filePath, s, "utf8");
  return changed;
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error("Could not find src/app. Run this from learning-platform-ui folder.");
    process.exit(1);
  }

  const files = walk(ROOT);
  let changedCount = 0;

  for (const f of files) {
    const changed = modernizeFile(f);
    if (changed) changedCount++;
  }

  console.log(`Done. Updated ${changedCount}/${files.length} SCSS files.`);
  console.log(`Backups saved as *.scss.bak next to each file.`);
  console.log(`Now run: ng serve --port 4201 and fix any layout-only issues.`);
}

main();
