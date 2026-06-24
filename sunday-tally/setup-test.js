const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)/);
  if (match) process.env[match[1]] = match[2];
});
const { createClient } = require('@supabase/supabase-js');


async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const jobId = 'dd11f168-1e1a-4c34-8a4c-c233db7d75d1';
  const { data: job, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    console.error('Error fetching job:', error);
    return;
  }

  console.log('Fetched job:', job.id, 'Church:', job.church_id);
  const rawSources = job.sources.raw;
  const normalized = job.sources.normalized;
  const freeText = job.sources.free_text || undefined;

  // Let's write a small wrapper that imports runStageA and calls it
  // Since runStageA is TypeScript, we should probably run it with tsx or next
  fs.writeFileSync('test-run-stage-a.ts', `
import { createClient } from '@supabase/supabase-js'
import { runStageA } from './src/lib/import/stageA'
import { config } from 'dotenv'
config({ path: '.env.local' })

async function execute() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const rawSources = ${JSON.stringify(rawSources, null, 2)};
  const normalized = ${JSON.stringify(normalized, null, 2)};
  const freeText = ${JSON.stringify(freeText)} || undefined;
  
  try {
    const result = await runStageA({
      supabase,
      churchId: '${job.church_id}',
      sources: normalized,
      sourceInputs: rawSources,
      freeText,
      jobId: '${job.id}'
    })
    console.log('Success:', result.totalCents)
  } catch (err) {
    console.error('STAGE A FAILED WITH ERROR:')
    console.error(err)
    if (err.stack) console.error(err.stack)
  }
}

execute().catch(console.error)
  `);
  console.log('Wrote test-run-stage-a.ts');
}

run().catch(console.error);
