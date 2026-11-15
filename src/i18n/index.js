import i18next from 'i18next';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { localizedUrl, stripLanguage } from './urls.js';

export const languages = ['sl','en','de'];
export const localeNames = {sl:'Slovenščina',en:'English',de:'Deutsch'};
export const locales = {sl:'sl-SI',en:'en-GB',de:'de-DE'};
export const languageContext = new AsyncLocalStorage();
export const resources = {};
for (const language of languages) {
  resources[language] = {};
  const directory = new URL(`../locales/${language}/`, import.meta.url);
  if (fs.existsSync(directory)) for (const file of fs.readdirSync(directory).filter(file=>file.endsWith('.json'))) resources[language][file.slice(0,-5)] = JSON.parse(fs.readFileSync(new URL(file,directory),'utf8'));
}
export const i18n = i18next.createInstance();
i18n.init({resources,lng:'sl',fallbackLng:'sl',supportedLngs:languages,initImmediate:false,ns:Object.keys(resources.sl),defaultNS:'common',keySeparator:false,interpolation:{escapeValue:false}});
export const currentLanguage = () => languageContext.getStore()?.language || 'sl';
export const tr = (key,options={}) => i18n.t(key,{lng:currentLanguage(),...options});
export const formatDate = (value, options = {}) => new Date(value).toLocaleDateString(locales[currentLanguage()],{timeZone:'Europe/Ljubljana',...options});
export const unitLabel = (unit,language=currentLanguage()) => {const id=({'kos':'piece','žlica':'tablespoon','žlička':'teaspoon'})[unit] || unit;const key=({piece:'unitPiece',tablespoon:'unitTablespoon',teaspoon:'unitTeaspoon'})[id];return key?i18n.t('common:'+key,{lng:language}):unit;};

export function localization(db, production) {
  return (req,res,next) => {
    const cookie = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('mk.lang='))?.slice(8);
    const language = req.urlLanguage || (languages.includes(req.user?.language) ? req.user.language : languages.includes(cookie) ? cookie : 'sl');
    req.language=language;
    if(req.user)req.user.language=language;
    const browserKeys=['moveUp','moveDown','remove','diced','step','canonicalIngredient','select','s53bc9dd2fcff','sd0883901c3cb','s119dd8d6a84e','s6e4ea9642719','s13edd8ae97e2','s4f4ee2fd1e5f'];
    const browserMessages=Object.fromEntries(Object.entries(resources[language].common||{}).filter(([key])=>browserKeys.includes(key)||['Količina','Enota','Izberite od 1 do 100 porcij.'].includes(resources.sl.common[key])).map(([key,value])=>['common:'+key,value]));
    Object.assign(res.locals,{language,languages,localeNames,locale:locales[language],t:tr,formatDate,unitLabel,browserMessages});
    languageContext.run({language},()=>{if(req.user&&!req.user.householdId)req.user.householdName=tr('common:noWorkspace');next();});
  };
}
export function changeLanguage(db,production) {
  return (req,res) => {
    const language=req.body.language;
    if(!languages.includes(language))throw Object.assign(new Error(tr('common:invalidLanguage')),{status:422});
    if(req.user)db.update(users).set({language}).where(eq(users.id,req.user.id)).run();
    res.cookie('mk.lang',language,{httpOnly:true,sameSite:'lax',secure:production,maxAge:365*86400000,path:'/'});
    const destination=typeof req.body.returnTo==='string' && /^\/(?!\/)[^\\\r\n]*$/.test(req.body.returnTo) ? req.body.returnTo : req.user?'/settings':'/login';
    const target=new URL(destination,'http://local');
    // Switching interface language leaves an explicit submission preview, while
    // retaining collection/search filters such as view=public.
    target.searchParams.delete('reviewLanguage');
    res.redirect(localizedUrl(stripLanguage(target.pathname)+target.search+target.hash,language,true));
  };
}
