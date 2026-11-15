const messages=JSON.parse(document.querySelector('meta[name="mk-translations"]')?.content || '{}');
export function tr(key,values={}) {let text=messages[key] || key;for(const [name,value] of Object.entries(values))text=text.replaceAll(`{{${name}}}`,String(value));return text;}
export const language=document.documentElement.lang || 'sl';
export function localizedUrl(value) {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return value;
  return '/' + language + value.replace(/^\/(sl|si|en|de)(?=\/|\?|#|$)/,'');
}
