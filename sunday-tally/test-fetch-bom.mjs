async function run() {
  const fetch = globalThis.fetch;
  try {
    const res = await fetch('http://localhost:12345', {
      headers: {
        'x-test': '\uFEFFhello'
      }
    });
  } catch(e) {
    console.log("Headers value BOM:", e.message);
  }
  try {
    const res = await fetch('http://localhost:12345', {
      headers: {
        '\uFEFFx-test': 'hello'
      }
    });
  } catch(e) {
    console.log("Headers key BOM:", e.message);
  }
  try {
    const res = await fetch('\uFEFFhttp://localhost:12345');
  } catch(e) {
    console.log("URL BOM:", e.message);
  }
}
run();
