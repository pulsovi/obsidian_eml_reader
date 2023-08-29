const path = require('path');

const fs = require('fs-extra');

const plugin = 'obsidian-eml-reader';

// This file must content an array : list of root vault folders
const vaults = require('./.watchrc.json');

function watch (file) {
  let timeoutId = null;
  const watcher = fs.watch(file, { persistent: true }, (event, filename) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => handleEvent(event, filename), 200);
  });
}

function handleEvent (event, filename) {
  console.log(event, filename);
  const src = path.resolve(filename);
  const dest = `.obsidian\\plugins\\${plugin}\\${filename}`;
  console.log('copy file', src, 'to', dest);
  vaults.forEach(vault => {
    const filename = path.join(vault, dest);
    console.log('reload', filename);
    fs.copy(src, filename, (err) => { console.log('error:', err); });
  });
}

['./main.js', 'manifest.json', 'styles.css'].forEach(watch);
