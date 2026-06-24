// Using native fetch

import Papa from 'papaparse';

async function run() {
  const url = 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/export?format=csv&gid=181499763';
  const res = await fetch(url);
  const text = await res.text();
  console.log('Total length:', text.length);
  
  // Search for BOM or chars > 255
  let found = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 255) {
      console.log(`Found char > 255 at index ${i}: ${text.charCodeAt(i)} (char: ${text[i]})`);
      found++;
    }
  }
  console.log('Total > 255 chars:', found);

  // also test Papa parse
  function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
  
  const parsed = Papa.parse(stripBom(text), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  
  console.log('Columns:', parsed.meta.fields);
  for (const col of parsed.meta.fields) {
      if (col) {
        for (let i = 0; i < col.length; i++) {
          if (col.charCodeAt(i) > 255) {
            console.log(`Column ${col} has >255 char at index ${i}: ${col.charCodeAt(i)}`);
          }
        }
      }
  }
}

run().catch(console.error);
