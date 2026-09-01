#!/usr/bin/env node
/**
 * PreToolUse hook — אכיפת "כלל הזהב" מ-CLAUDE.md:
 * לעולם לא להריץ `npm run build` / `next build` בזמן ש-dev server רץ על 3010,
 * כי זה דורס את .next וגורם לשרת הרץ לקרוס (Cannot find module / JSON errors).
 *
 * חוסם רק כאשר פורט 3010 באמת מאזין. אם ה-dev כבוי - build עובר כרגיל.
 * נכתב ב-Node (net) כדי לעבוד גם ב-Windows וגם ב-web בלי תלות בשל.
 *
 * מנגנון: קורא את קלט ה-JSON של הכלי מ-stdin, ואם הפקודה היא build ופורט 3010
 * פתוח - יוצא בקוד 2 עם הסבר ל-stderr (Claude Code חוסם את הקריאה).
 */
import net from 'node:net';

const DEV_PORT = 3010;
const BUILD_RE = /\b(next\s+build|npm\s+run\s+build|npm\s+run-script\s+build|yarn\s+build|pnpm\s+build)\b/;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    // אם אין stdin (הפעלה ידנית) - לא נתקע.
    setTimeout(() => resolve(data), 1000);
  });
}

function portIsListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(400);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const raw = await readStdin();
let command = '';
try {
  const input = JSON.parse(raw);
  // Bash: tool_input.command. כלים אחרים (PowerShell) - סורקים את כל ה-input.
  command = input?.tool_input?.command ?? JSON.stringify(input?.tool_input ?? input ?? '');
} catch {
  command = raw;
}

if (!BUILD_RE.test(command)) process.exit(0);

if (await portIsListening(DEV_PORT)) {
  process.stderr.write(
    `⛔ נחסם: זוהתה פקודת build בזמן ש-dev server רץ על פורט ${DEV_PORT}.\n` +
      `הרצת build תדרוס את .next ותפיל את השרת הרץ (כלל הזהב ב-CLAUDE.md).\n` +
      `לבדיקת טייפים תוך כדי dev: npx tsc --noEmit. ל-build אמיתי: קודם לעצור את ה-dev server.\n`,
  );
  process.exit(2);
}

process.exit(0);
