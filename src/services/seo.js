import { localizedUrl } from '../i18n/urls.js';
import { languages,unitLabel } from '../i18n/index.js';

export const safeJson = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export const xmlEscape = value => String(value).replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[char]);
export function seoService(config) {
  // Canonicals never trust a client-supplied Host or X-Forwarded-Host header.
  const origin=config.siteUrl || `http://127.0.0.1:${config.port||3000}`;
  const absolute=(path,language)=>new URL(localizedUrl(path,language,true),origin).href;
  const metadata=(language,path,title,description,versions=languages.map(language=>({language,href:path})),image=null)=>({title,description:String(description).replace(/\s+/g,' ').trim().slice(0,180),canonical:absolute(path,language),alternates:versions.map(v=>({language:v.language,url:absolute(v.href,v.language),path:localizedUrl(v.href,v.language,true)})),image:image?absolute(image,language):null});
  return {
    origin,absolute,metadata,
    recipe(recipe,versions) {
      const image=recipe.images[0]?.url;
      const seo=metadata(recipe.language,recipe.href,recipe.title+' · Moja kuhinja',recipe.description||recipe.title,versions,image);
      const data={'@context':'https://schema.org','@type':'Recipe',name:recipe.title,description:recipe.description||undefined,inLanguage:recipe.language,url:seo.canonical,
        image:recipe.images.length?recipe.images.map(i=>absolute(i.url,recipe.language)):undefined,
        author:recipe.author?{'@type':'Person',name:recipe.author}:undefined,
        prepTime:recipe.prepMinutes===null?undefined:`PT${recipe.prepMinutes}M`,cookTime:recipe.cookMinutes===null?undefined:`PT${recipe.cookMinutes}M`,totalTime:recipe.prepMinutes===null||recipe.cookMinutes===null?undefined:`PT${recipe.prepMinutes+recipe.cookMinutes}M`,recipeYield:recipe.servings===null?undefined:String(recipe.servings),
        recipeCategory:recipe.categories.map(c=>c.name),
        recipeIngredient:recipe.ingredients.map(i=>[i.quantity===null?'':String(i.quantity).replace('.',recipe.language==='en'?'.':','),unitLabel(i.unit,recipe.language),i.name,i.note].filter(Boolean).join(' ')),
        recipeInstructions:recipe.steps.map((text,index)=>({'@type':'HowToStep',position:index+1,text})),
      };
      return {...seo,jsonLd:safeJson(data)};
    },
    sitemap(entries) {
      const grouped=new Map();for(const entry of entries){if(!grouped.has(entry.id))grouped.set(entry.id,[]);grouped.get(entry.id).push(entry);}
      const nodes=entries.map(entry=>{
        const lastmod=entry.updatedAt && Number.isFinite(Date.parse(entry.updatedAt))?`<lastmod>${xmlEscape(new Date(entry.updatedAt).toISOString())}</lastmod>`:'';
        const alternatives=grouped.get(entry.id).map(v=>`<xhtml:link rel="alternate" hreflang="${v.language}" href="${xmlEscape(absolute(v.href,v.language))}"/>`).join('');
        return `<url><loc>${xmlEscape(absolute(entry.href,entry.language))}</loc>${lastmod}${alternatives}</url>`;
      });
      return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+nodes.join('')+'</urlset>';
    },
  };
}
