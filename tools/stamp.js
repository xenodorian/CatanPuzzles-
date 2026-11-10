// Stamps the site with a version so browsers never keep showing an old cached copy.
// Run before every commit that changes the site:  node tools/stamp.js
//
// What it does:
//   1. Computes a short hash of all site files.
//   2. Writes it to version.txt.
//   3. Puts a small script at the top of every page. On load the page fetches version.txt
//      (bypassing the cache) and, if the site has a newer version than the page, reloads
//      itself once from the network.
//   4. Adds ?v=<hash> to local stylesheet, script and game links so they are refetched too.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
const assets = ['vault.css'].concat(fs.readdirSync(path.join(root, 'puzzles')).filter(f => f.endsWith('.js')).sort().map(f => 'puzzles/' + f));

const BLOCK = /<!--vault-version-->[\s\S]*?<!--\/vault-version-->\n?/;
const REF = /((?:href|src)=")((?:puzzles\/)?[A-Za-z0-9_-]+\.(?:css|js|html))(?:\?v=[a-z0-9]+)?(")/g;

function strip(html) { return html.replace(BLOCK, '').replace(REF, '$1$2$3'); }

const clean = {};
const hash = crypto.createHash('sha256');
for (const f of pages) { clean[f] = strip(fs.readFileSync(path.join(root, f), 'utf8')); hash.update(f + '\n' + clean[f]); }
for (const f of assets) hash.update(f + '\n' + fs.readFileSync(path.join(root, f)));
const V = hash.digest('hex').slice(0, 10);

const snippet = v => '<!--vault-version--><script>(function(){var V="' + v + '";try{fetch("version.txt?t="+Date.now(),{cache:"no-store"})' +
  '.then(function(r){return r.ok?r.text():""}).then(function(t){t=t.trim();if(!t||t===V||!/^[a-z0-9]{6,16}$/.test(t))return;' +
  'var k="vault-reload-"+t+location.pathname;try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){return}' +
  'var u=new URL(location.href);u.searchParams.set("v",t);location.replace(u.href)}).catch(function(){})}catch(e){}})();</script><!--/vault-version-->\n';

for (const f of pages) {
  let html = clean[f];
  const i = html.indexOf('<head>');
  if (i < 0) throw new Error(f + ': no <head>');
  html = html.slice(0, i + 6) + '\n' + snippet(V) + html.slice(i + 6).replace(/^\n/, '');
  // version local css and js everywhere; version links to game pages on the main page only
  html = html.replace(REF, (m, a, file, c) => {
    if (file.endsWith('.html') && (f !== 'index.html' || file === 'index.html')) return a + file + c;
    if (!fs.existsSync(path.join(root, file))) return a + file + c;
    return a + file + '?v=' + V + c;
  });
  fs.writeFileSync(path.join(root, f), html);
}
fs.writeFileSync(path.join(root, 'version.txt'), V + '\n');
console.log('version', V, 'stamped', pages.length, 'pages');
