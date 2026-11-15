import { tr } from '../i18n/index.js';
export function parseComment(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return { success: false, error: tr("recipes:s32d8a94d9f68") };
  if (text.length > 2000) return { success: false, error: tr("recipes:sbf2feb367cf4") };
  return { success: true, data: text };
}
