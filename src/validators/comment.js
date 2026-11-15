export function parseComment(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return { success: false, error: 'Vnesite komentar.' };
  if (text.length > 2000) return { success: false, error: 'Komentar lahko vsebuje največ 2000 znakov.' };
  return { success: true, data: text };
}
