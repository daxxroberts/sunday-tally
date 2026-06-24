import Anthropic from '@anthropic-ai/sdk';
import fetch from 'node-fetch'; // if needed
import Papa from 'papaparse';

async function run() {
  const url = 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/export?format=csv&gid=181499763';
  const res = await fetch(url);
  const text = await res.text();
  function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
  
  const parsed = Papa.parse(stripBom(text), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  
  const allRows = parsed.data;
  const headers = parsed.meta.fields.filter(Boolean);
  
  const userPrompt =
    `Today's date: 2024-05-10. Do NOT flag dates on or before today as future-date anomalies.\n\n` +
    `Source: "Test Source"\n` +
    `Total rows: ${allRows.length}\n\n` +
    `Sample rows (first 20):\n` +
    JSON.stringify(allRows.slice(0, 20), null, 2) + '\n\n' +
    `Call report_patterns exactly once.`;

  console.log("userPrompt length:", userPrompt.length);
  
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-api03-xxx' });
  
  try {
    // We will just do a dry run of the request build to see if undici throws
    const request = client.buildRequest({
      method: 'post',
      path: '/v1/messages',
      body: {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: userPrompt }]
      }
    });
    console.log("Request built successfully. Headers:", request.headers);
  } catch (err) {
    console.error("Error building request:", err);
  }
}

run().catch(console.error);
