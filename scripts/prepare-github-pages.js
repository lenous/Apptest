const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const rootDir = path.join(__dirname, '..');
const indexPath = path.join(docsDir, 'index.html');
const notFoundPath = path.join(docsDir, '404.html');
const noJekyllPath = path.join(docsDir, '.nojekyll');

let html = fs.readFileSync(indexPath, 'utf8');

html = html
  .replace(/src="\/(_expo\/[^"]+)"/g, 'src="./$1"')
  .replace(/href="\/(_expo\/[^"]+)"/g, 'href="./$1"')
  .replace(/src="\/(assets\/[^"]+)"/g, 'src="./$1"')
  .replace(/href="\/(assets\/[^"]+)"/g, 'href="./$1"');

fs.writeFileSync(indexPath, html);
fs.writeFileSync(notFoundPath, html);
fs.writeFileSync(noJekyllPath, '');

for (const name of ['_expo', 'assets']) {
  const source = path.join(docsDir, name);
  const target = path.join(rootDir, name);

  fs.rmSync(target, { recursive: true, force: true });
  if (fs.existsSync(source)) {
    fs.cpSync(source, target, { recursive: true });
  }
}

for (const name of ['index.html', '404.html', 'metadata.json', '.nojekyll']) {
  fs.copyFileSync(path.join(docsDir, name), path.join(rootDir, name));
}
