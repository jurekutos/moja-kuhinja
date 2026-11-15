export function rejectFields(input, allowed) {
  if (Object.keys(input).some(key=>!allowed.includes(key))) throw Object.assign(new Error('Zahteva vsebuje nedovoljena polja. E-poštnega naslova in pravic ni mogoče spreminjati.'),{status:422});
}
export function displayName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw Object.assign(new Error('Ime mora vsebovati od 1 do 100 znakov.'),{status:422});
  return value.trim();
}
export function passwordChange(input) {
  rejectFields(input,['_csrf','currentPassword','newPassword','confirmation']);
  if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length > 1024) throw Object.assign(new Error('Vnesite trenutno geslo.'),{status:422});
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 8 || input.newPassword.length > 1024) throw Object.assign(new Error('Novo geslo mora vsebovati od 8 do 1024 znakov.'),{status:422});
  if (input.newPassword !== input.confirmation) throw Object.assign(new Error('Novi gesli se ne ujemata.'),{status:422});
}
