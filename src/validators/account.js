import { tr } from '../i18n/index.js';
export function rejectFields(input, allowed) {
  if (Object.keys(input).some(key=>!allowed.includes(key))) throw Object.assign(new Error(tr("auth:sf80a4ce23ddc")),{status:422});
}
export function displayName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw Object.assign(new Error(tr("auth:s0490da91a598")),{status:422});
  return value.trim();
}
export function passwordChange(input) {
  rejectFields(input,['_csrf','currentPassword','newPassword','confirmation']);
  if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length > 1024) throw Object.assign(new Error(tr("auth:s014d50d3a70c")),{status:422});
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 8 || input.newPassword.length > 1024) throw Object.assign(new Error(tr("auth:s1024e8413dc7")),{status:422});
  if (input.newPassword !== input.confirmation) throw Object.assign(new Error(tr("auth:s16a34173e64d")),{status:422});
}
