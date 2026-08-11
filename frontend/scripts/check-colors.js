import fs from 'fs';
import path from 'path';

// Allowed color tokens inside components are only those mapped to semantic tokens via CSS variables
// or explicitly permitted specific strings.
const FORBIDDEN_COLORS_REGEX = /\b(?:bg|text|border|ring)-(red|blue|green|emerald|sky|violet|rose|amber|orange|yellow|teal|cyan|indigo|purple|pink|lime|fuchsia|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\b/g;

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let hasErrors = false;

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(FORBIDDEN_COLORS_REGEX);
    if (matches) {
      console.error(`❌ Error in ${filePath}: Found raw color tokens: ${matches.join(', ')}`);
      hasErrors = true;
    }
  }
});

if (hasErrors) {
  console.error('\nRaw Tailwind color utility classes are not allowed in components. Please use semantic CSS variables (e.g., bg-[hsl(var(--success))]).');
  process.exit(1);
} else {
  console.log('✅ Color token check passed.');
}
