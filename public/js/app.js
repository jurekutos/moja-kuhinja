import { scaleQuantity } from './quantities.js';
const invitationUrl = document.getElementById('invitation-url');
if (invitationUrl) {
  invitationUrl.value = new URL(invitationUrl.value, location.origin).href;
  document.getElementById('copy-invitation')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(invitationUrl.value); document.getElementById('copy-status').textContent = 'Povezava je kopirana.'; }
    catch { invitationUrl.focus(); invitationUrl.select(); document.getElementById('copy-status').textContent = 'Pritisnite Ctrl+C ali kopirajte označeno povezavo.'; }
  });
}
document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit', event => { if (!confirm(form.dataset.confirm)) event.preventDefault(); }));
document.getElementById('validation-errors')?.focus();
const servings = document.getElementById('servings');
servings?.addEventListener('input', () => {
  const target = Number(servings.value); const valid = Number.isInteger(target) && target >= 1 && target <= 100;
  servings.setCustomValidity(valid ? '' : 'Izberite od 1 do 100 porcij.');
  document.getElementById('servings-error').textContent = valid ? '' : 'Izberite od 1 do 100 porcij.';
  if (valid) document.querySelectorAll('[data-quantity]').forEach(el => { el.textContent = scaleQuantity(el.dataset.quantity, Number(servings.dataset.base), target); });
  if (valid) { const cookLink = document.querySelector('[data-cook-link]'); if (cookLink) { const url = new URL(cookLink.href); url.searchParams.set('servings',target); cookLink.href = url.href; } }
});
if (servings) {
  const plannedServings = new URLSearchParams(location.search).get('servings');
  if (plannedServings && /^\d+$/.test(plannedServings) && Number(plannedServings) >= 1 && Number(plannedServings) <= 100) {
    servings.value = plannedServings; servings.dispatchEvent(new Event('input'));
  }
}
const checks = [...document.querySelectorAll('.step-checkbox')];
const updateProgress = () => { const progress = document.getElementById('step-progress'); if (progress) progress.textContent = `${checks.filter(c => c.checked).length} / ${checks.length}`; };
checks.forEach(check => check.addEventListener('change', updateProgress));
document.getElementById('reset-steps')?.addEventListener('click', () => { checks.forEach(c => { c.checked = false; }); updateProgress(); });
const form = document.getElementById('recipe-form');
if (form) {
  const ingredientData = document.getElementById('ingredients-json'); const stepData = document.getElementById('steps-json');
  const ingredientRows = document.getElementById('ingredient-rows'); const stepRows = document.getElementById('step-rows');
  function button(text, label, action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-button'; b.textContent = text; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', action); return b; }
  function reorder(row, direction, parent) { const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling; if (sibling) { if (direction < 0) parent.insertBefore(row, sibling); else parent.insertBefore(sibling, row); } sync(); }
  function tools(row, parent, name) {
    const el = document.createElement('div'); el.className = 'row-tools';
    el.append(button('↑', `${name}: premakni navzgor`, () => reorder(row, -1, parent)), button('↓', `${name}: premakni navzdol`, () => reorder(row, 1, parent)), button('×', `${name}: odstrani`, () => { row.remove(); sync(); }));
    return el;
  }
  function field(row, labelText, key, value, maxLength, extra = {}) { const label = document.createElement('label'); label.textContent = labelText; const input = document.createElement('input'); input.dataset.field = key; input.value = value ?? ''; input.maxLength = maxLength; Object.assign(input, extra); label.append(input); row.append(label); return input; }
  function addIngredient(value = {}) {
    if (ingredientRows.children.length >= 100) return;
    const row = document.createElement('div'); row.className = 'ingredient-row';
    field(row, 'Sestavina', 'name', value.name, 150, { required: true, placeholder: 'npr. piščanec' });
    field(row, 'Količina', 'quantity', value.quantity, 12, { inputMode: 'decimal', placeholder: '300' });
    field(row, 'Enota', 'unit', value.unit, 40).setAttribute('list', 'units');
    field(row, 'Opomba', 'note', value.note, 250, { placeholder: 'npr. na kocke' });
    row.append(tools(row, ingredientRows, 'Sestavina')); ingredientRows.append(row); sync();
  }
  function addStep(value = '') {
    if (stepRows.children.length >= 100) return;
    const row = document.createElement('div'); row.className = 'step-row'; const label = document.createElement('label'); label.className = 'step-label';
    const number = document.createElement('span'); number.className = 'step-caption'; label.append(number);
    const textarea = document.createElement('textarea'); textarea.value = value; textarea.rows = 3; textarea.maxLength = 3000; textarea.required = true; label.append(textarea); row.append(label, tools(row, stepRows, 'Korak')); stepRows.append(row); sync();
  }
  function sync() {
    ingredientData.value = JSON.stringify([...ingredientRows.children].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value]))));
    stepData.value = JSON.stringify([...stepRows.querySelectorAll('textarea')].map(input => input.value));
    stepRows.querySelectorAll('.step-caption').forEach((label, i) => { label.textContent = `Korak ${i + 1}`; });
    for (const parent of [ingredientRows, stepRows]) [...parent.children].forEach((row, i) => { const buttons = row.querySelectorAll('.row-tools button'); buttons[0].disabled = i === 0; buttons[1].disabled = i === parent.children.length - 1; });
    document.getElementById('add-ingredient').disabled = ingredientRows.children.length >= 100;
    document.getElementById('add-step').disabled = stepRows.children.length >= 100;
  }
  const initialIngredients = JSON.parse(ingredientData.value); const initialSteps = JSON.parse(stepData.value);
  initialIngredients.forEach(addIngredient); initialSteps.forEach(addStep);
  document.getElementById('add-ingredient').addEventListener('click', () => { addIngredient(); ingredientRows.lastElementChild?.querySelector('input')?.focus(); });
  document.getElementById('add-step').addEventListener('click', () => { addStep(); stepRows.lastElementChild?.querySelector('textarea')?.focus(); });
  form.addEventListener('input', sync); form.addEventListener('submit', sync);
}
