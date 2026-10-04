import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [session = 'hb'] = process.argv.slice(2);

const code = `
async (page) => {
  return await page.evaluate(() => {
    const header = document.querySelector('.hb-header, header, .header');
    const navText = header ? header.innerText.replace(/\\n+/g, '|') : '';
    const confirm = document.querySelector('.link-reply__menu-btn.hb-color__btn--confirm');
    return {
      navText: navText,
      hasLoginBtn: /登录/.test(navText),
      hasAvatarInNav: !!document.querySelector('.hb-header .hb-cpt-avatar, header .hb-cpt-avatar'),
      cookieKeys: document.cookie.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean),
      hasConfirmBtn: !!confirm,
      confirmVisible: confirm ? getComputedStyle(confirm).display : null,
    };
  });
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-probe-'));
const scriptFile = join(dir, 'probe-login.js');
writeFileSync(scriptFile, code, 'utf8');

const bin = 'C:\\Users\\28529\\AppData\\Roaming\\npm\\playwright-cli.cmd';
const out = execFileSync('cmd.exe', ['/c', bin, `-s=${session}`, '--raw', 'run-code', `--filename=${scriptFile}`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

try {
  console.log(JSON.stringify(JSON.parse(out.trim()), null, 2));
} catch {
  console.log(out.slice(0, 3000));
}
