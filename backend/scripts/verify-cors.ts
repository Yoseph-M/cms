import http from 'http';
import { app } from '../src/app';

async function main() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No port');
  const port = addr.port;

  async function check(origin: string) {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: origin },
    });
    return {
      status: res.status,
      acao: res.headers.get('access-control-allow-origin'),
    };
  }

  const allowed = await check('http://localhost:5173');
  const blocked = await check('https://evil.example.com');

  console.log(JSON.stringify({ allowed, blocked }, null, 2));

  const ok =
    allowed.acao === 'http://localhost:5173' &&
    (blocked.acao === null || blocked.acao !== 'https://evil.example.com');

  server.close();
  if (!ok) {
    console.error('CORS verification FAILED');
    process.exit(1);
  }
  console.log('CORS verification PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
