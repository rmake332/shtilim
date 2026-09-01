---
name: dev-server
description: >-
  ניהול מחזור החיים של שרת הפיתוח של שתילים (Next.js, פורט 3010) — הפעלה,
  המתנה עד שהוא עונה, שחרור פורט תפוס/שרת יתום, וריפוי .next שנשבר. השתמש בסקיל
  הזה בכל פעם שצריך להריץ/להפעיל מחדש את השרת, כשהשרת תקוע או לא מגיב, כשמופיע
  "Cannot find module" / "Unexpected end of JSON input", או כשפורט 3010 תפוס.
  כולל את "כלל הזהב" — לעולם לא להריץ build בזמן ש-dev רץ.
---

# שרת הפיתוח (שתילים)

`npm run dev` כבר כולל `-p 3010` — **אין להוסיף `-p 3010` שוב**. השרת רץ מול
Airtable אמיתי (`AIRTABLE_MOCK=0` דרך `.env.local`). טוקן בדיקה: `shtilim-123456`
→ `http://localhost:3010/form/shtilim-123456`.

## ⛔ כלל הזהב

**לעולם לא להריץ `npm run build` / `next build` בזמן שהדב-סרבר רץ.** זה דורס את
`.next` ומפיל את השרת הרץ (`Cannot find module`, `Unexpected end of JSON input`).
לבדיקת טייפים תוך כדי dev: `npx tsc --noEmit`. `npm test` (vitest) בטוח — לא נוגע
ב-`.next`. (יש PreToolUse hook שחוסם build כשפורט 3010 מאזין — ראה
`.claude/hooks/block-build-during-dev.mjs`.)

## הפעלה + המתנה עד שעונה

**web / Linux / macOS (bash):**
```bash
npm run dev &                                                   # ברקע
node .claude/skills/dev-server/scripts/wait-up.mjs              # מחכה עד HTTP על 3010
```

**Windows (PowerShell):**
```powershell
Start-Process powershell -ArgumentList '-NoProfile','-Command','npm run dev' -WindowStyle Normal
node .claude/skills/dev-server/scripts/wait-up.mjs
```

סקריפט ההמתנה חוצה-פלטפורמות; אפשר גם פורט/טיימאאוט מותאמים:
`node .claude/skills/dev-server/scripts/wait-up.mjs 3011 60`.

## שחרור פורט 3010 תפוס / שרת יתום

**Windows (מ-CLAUDE.md):**
```powershell
Get-NetTCPConnection -LocalPort 3010 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }
```

**web / Linux / macOS:**
```bash
# מזהה ומוריד את מי שמאזין על 3010
lsof -ti tcp:3010 | xargs -r kill -9   # או: fuser -k 3010/tcp
```

## ריפוי `.next` שנשבר

סימנים: `Cannot find module './xxx'`, `Unexpected end of JSON input`, השרת קרס
אחרי build מקביל. התיקון: לעצור את השרת → למחוק `.next` → להפעיל מחדש.

**Windows:**
```powershell
Get-NetTCPConnection -LocalPort 3010 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run dev
```
**web / Linux / macOS:**
```bash
lsof -ti tcp:3010 | xargs -r kill -9
rm -rf .next
npm run dev &
```

## רשימת בחירה מציגה ערך ישן אחרי שינוי באיירטייבל

זה קאש fetch, לא באג. בטוח למחוק בזמן שהשרת רץ:
```powershell
Remove-Item .next\cache\fetch-cache -Recurse -Force   # Windows
```
```bash
rm -rf .next/cache/fetch-cache                         # web / Linux / macOS
```

## מצב mock (בלי Airtable)

```bash
AIRTABLE_MOCK=1 npx next dev -p 3011
```
שימושי לבדיקות שאין בהן צורך בדאטה אמיתי (למשל תרחישי `verify-schedule` עם טוקן `dev`).
