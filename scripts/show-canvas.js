import { readFileSync, existsSync } from 'fs';
const path = '/vercel/share/v0-project/components/editor/Canvas.tsx';
console.log('exists:', existsSync(path));
if (existsSync(path)) {
  const c = readFileSync(path, 'utf8');
  console.log('length:', c.length);
  console.log('first 100 chars:', c.slice(0, 100));
}
