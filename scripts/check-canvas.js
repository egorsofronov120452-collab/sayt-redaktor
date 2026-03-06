import { readFileSync } from 'fs';
const content = readFileSync('/vercel/share/v0-project/components/editor/Canvas.tsx', 'utf8');
const lines = content.split('\n');
// Print lines 200-225
for (let i = 199; i < 230 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
