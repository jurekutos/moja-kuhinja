import { tr,language } from './i18n.js';
import { scaleQuantity } from './quantities.js';
const invitationUrl = document.getElementById('invitation-url');
if (invitationUrl) {
  invitationUrl.value = new URL(invitationUrl.value, location.origin).href;
  document.getElementById('copy-invitation')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(invitationUrl.value); document.getElementById('copy-status').textContent = tr("common:s53bc9dd2fcff"); }
    catch { invitationUrl.focus(); invitationUrl.select(); document.getElementById('copy-status').textContent = tr("common:sd0883901c3cb"); }
  });
}
document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit', event => { if (!confirm(form.dataset.confirm)) event.preventDefault(); }));
document.getElementById('validation-errors')?.focus();
const servings = document.getElementById('servings');
servings?.addEventListener('input', () => {
  const target = Number(servings.value); const valid = Number.isInteger(target) && target >= 1 && target <= 100;
  servings.setCustomValidity(valid ? '' : tr("common:se292cb629e65"));
  document.getElementById('servings-error').textContent = valid ? '' : tr("common:se292cb629e65");
  if (valid) document.querySelectorAll('[data-quantity]').forEach(el => { el.textContent = scaleQuantity(el.dataset.quantity, Number(servings.dataset.base), target, language); });
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
    el.append(button('↑', `${name}: ${tr('common:moveUp')}`, () => reorder(row, -1, parent)), button('↓', `${name}: ${tr('common:moveDown')}`, () => reorder(row, 1, parent)), button('×', `${name}: ${tr('common:remove')}`, () => { row.remove(); sync(); }));
    return el;
  }
  function field(row, labelText, key, value, maxLength, extra = {}) { const label = document.createElement('label'); label.textContent = labelText; const input = document.createElement('input'); input.dataset.field = key; input.value = value ?? ''; input.maxLength = maxLength; Object.assign(input, extra); label.append(input); row.append(label); return input; }
  function addIngredient(value = {}) {
    if (ingredientRows.children.length >= 100) return;
    const row = document.createElement('div'); row.className = 'ingredient-row';
    const nameInput=field(row, tr("common:s119dd8d6a84e"), 'name', value.name, 150, { required: true, placeholder: tr("common:s6e4ea9642719") });
    field(row, tr("common:sfbe09f2efb97"), 'quantity', value.quantity, 12, { inputMode: 'decimal', placeholder: '300' });
    field(row, tr("common:se2f89e79bea4"), 'unit', value.unit, 40).setAttribute('list', 'units');
    field(row, tr("common:s13edd8ae97e2"), 'note', value.note, 250, { placeholder: tr('common:diced') });
    row.dataset.canonicalId=value.canonicalIngredientId || '';
    const catalogLabel=document.createElement('label');catalogLabel.textContent=tr('common:canonicalIngredient');
    const catalogSelect=document.createElement('select');catalogLabel.append(catalogSelect);row.append(catalogLabel);
    async function suggest(){const needle=nameInput.value;try{const response=await fetch('/ingredients/autocomplete?q='+encodeURIComponent(needle));if(!response.ok)return;const choices=await response.json();if(nameInput.value!==needle)return;catalogSelect.replaceChildren(new Option(tr('common:select'),''));if(row.dataset.canonicalId&&!choices.some(v=>String(v.id)===row.dataset.canonicalId))catalogSelect.add(new Option('#'+row.dataset.canonicalId,row.dataset.canonicalId));for(const choice of choices)catalogSelect.add(new Option(choice.name,String(choice.id)));catalogSelect.value=row.dataset.canonicalId;}catch{/* Custom ingredients remain usable offline. */}}
    nameInput.addEventListener('input',()=>{row.dataset.canonicalId='';suggest();sync();});
    catalogSelect.addEventListener('change',()=>{row.dataset.canonicalId=catalogSelect.value;if(catalogSelect.value)nameInput.value=catalogSelect.selectedOptions[0].textContent;sync();});suggest();
    row.append(tools(row, ingredientRows, tr("common:s119dd8d6a84e"))); ingredientRows.append(row); sync();
  }
  function addStep(value = '') {
    if (stepRows.children.length >= 100) return;
    const row = document.createElement('div'); row.className = 'step-row'; const label = document.createElement('label'); label.className = 'step-label';
    const number = document.createElement('span'); number.className = 'step-caption'; label.append(number);
    const textarea = document.createElement('textarea'); textarea.value = value; textarea.rows = 3; textarea.maxLength = 3000; textarea.required = true; label.append(textarea); row.append(label, tools(row, stepRows, tr("common:s4f4ee2fd1e5f"))); stepRows.append(row); sync();
  }
  function sync() {
    ingredientData.value = JSON.stringify([...ingredientRows.children].map(row => ({...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value])),canonicalIngredientId:row.dataset.canonicalId?Number(row.dataset.canonicalId):null})));
    stepData.value = JSON.stringify([...stepRows.querySelectorAll('textarea')].map(input => input.value));
    stepRows.querySelectorAll('.step-caption').forEach((label, i) => { label.textContent = `${tr('common:step')} ${i + 1}`; });
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

const translationForm=document.querySelector('[data-translation-form]');
translationForm?.addEventListener('submit',()=>{
  translationForm.elements.ingredientsJson.value=JSON.stringify([...translationForm.querySelectorAll('[data-translated-ingredient]')].map(row=>({ingredientId:Number(row.dataset.translatedIngredient),name:row.querySelector('[data-translation-name]').value,note:row.querySelector('[data-translation-note]').value})));
  translationForm.elements.stepsJson.value=JSON.stringify([...translationForm.querySelectorAll('[data-translated-step]')].map(row=>({stepId:Number(row.dataset.translatedStep),body:row.value})));
});
