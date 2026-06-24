import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Webhook fired to Make.com whenever a position is submitted (new) or edited.
 * Triggers the downstream "ממתין לעדכון" scenario. URL is overridable via env.
 */
const SUBMIT_WEBHOOK_URL =
  process.env.SUBMIT_POSITION_WEBHOOK_URL ||
  'https://hook.eu2.make.com/gwynlqfizihyw5xr2pugvy2tthh0v1st';

/**
 * Webhook for developer error alerts. The Make scenario behind it appends a row
 * to a Google Sheet and emails the developer. No URL → alerts are skipped (only
 * logged), so missing config never breaks the form.
 */
const ERROR_WEBHOOK_URL = process.env.ERROR_WEBHOOK_URL || '';

/** Where the failure happened — drives the developer's triage. */
export type ErrorStage = 'airtable_write' | 'make_webhook';

export interface ErrorContext {
  stage: ErrorStage;
  /** Affected record, as far as it is known at the failure point. */
  name?: string;
  tz?: string;
  role?: string;
  institution?: string;
  /** Human-readable failure detail (error message / HTTP status). */
  detail: string;
}

/**
 * Send a developer error alert to Make (→ Google Sheet + email).
 * Best-effort and self-contained: it never throws, so it is safe to call from a
 * catch block without masking the original error.
 */
export async function notifyError(ctx: ErrorContext, requestId?: string): Promise<void> {
  const payload = {
    'סוג תקלה': ctx.stage === 'airtable_write' ? 'שגיאת כתיבה ל-Airtable' : 'כשל Webhook ל-Make',
    'שם': ctx.name || '',
    'ת.ז.': ctx.tz || '',
    'תפקיד': ctx.role || '',
    'מוסד': ctx.institution || '',
    'תאריך תקלה': new Date().toISOString(),
    'פירוט': ctx.detail,
    requestId: requestId || '',
  };

  if (!ERROR_WEBHOOK_URL) {
    logger.error({ ...payload }, 'error alert (no ERROR_WEBHOOK_URL configured)');
    return;
  }

  try {
    const res = await fetch(ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.error({ ...payload, status: res.status }, 'error webhook failed');
      return;
    }
    logger.info({ requestId, stage: ctx.stage }, 'error alert sent');
  } catch (e) {
    logger.error({ ...payload, err: String(e) }, 'error webhook threw');
  }
}

/**
 * Notify Make.com that a position was submitted/edited.
 * Best-effort: failures are logged but never block the form response.
 */
export async function notifySubmitWebhook(
  params: { tz: string; association?: string; name?: string; role?: string; institution?: string },
  requestId?: string,
): Promise<void> {
  const payload = [
    {
      'ת.ז.': params.tz,
      'עמותה': params.association ? [params.association] : [],
      'סטטוס': 'ממתין לעדכון',
    },
  ];

  const errCtx = (detail: string): ErrorContext => ({
    stage: 'make_webhook',
    name: params.name,
    tz: params.tz,
    role: params.role,
    institution: params.institution,
    detail,
  });

  try {
    const res = await fetch(SUBMIT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.error({ requestId, status: res.status }, 'submit webhook failed');
      await notifyError(errCtx(`Make webhook responded ${res.status}`), requestId);
      return;
    }
    logger.info({ requestId, tz: params.tz }, 'submit webhook sent');
  } catch (e) {
    logger.error({ requestId, err: String(e) }, 'submit webhook error');
    await notifyError(errCtx(`Make webhook network error: ${String(e)}`), requestId);
  }
}
