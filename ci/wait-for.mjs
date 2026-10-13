// Wait until a URL answers (any status below 500): node ci/wait-for.mjs <url> [seconds]
const [url, seconds = '120'] = process.argv.slice(2);
const deadline = Date.now() + Number(seconds) * 1000;
for (;;) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    if (res.status < 500) {
      console.log(`${url} is up (${res.status})`);
      break;
    }
  } catch {}
  if (Date.now() > deadline) {
    console.error(`${url} didn't come up within ${seconds}s`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
