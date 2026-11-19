import path from 'node:path';
import { languages,tr } from '../i18n/index.js';

export function publicSiteController(cookbook,seo,config,reads) {
  function render(req,res,view,data,metadata){res.removeHeader('X-Robots-Tag');if(metadata.robots)res.set('X-Robots-Tag',metadata.robots);return res.render(view,{...data,title:metadata.title,seo:metadata,publicWebsite:true});}
  return {
    landing(req,res){const featured=cookbook.featured(req.language,req.user);render(req,res,'landing',{featured},seo.metadata(req.language,'/welcome',tr('public:homeTitle'),tr('public:homeDescription'),undefined,'/images/landing-pasta.webp'));},
    directory(req,res){
      const result=cookbook.list(req.language,req.query,24,req.user);
      const canonical='/community'+(result.page>1?'?page='+result.page:'');
      const metadata=seo.metadata(req.language,canonical,tr('public:directoryTitle')+(result.page>1?' · '+result.page:'')+' · Moja kuhinja',tr('public:directoryDescription'));
      if(result.query.q||result.query.ingredient||result.query.maxTime||result.query.category||result.query.sort!=='newest'||result.query.favorite)metadata.robots='noindex, follow';
      if(result.page>1)metadata.alternates=[];
      const pageLink=page=>{const params=new URLSearchParams();for(const [key,value] of Object.entries(result.query))if(value && !(key==='sort'&&value==='newest'))params.set(key,value);if(page>1)params.set('page',String(page));return '/community'+(params.size?'?'+params.toString():'');};
      render(req,res,'public/recipes',{...result,pageLink},metadata);
    },
    detail(req,res,next){
      const match=/^([1-9]\d*)(?:-[a-z0-9-]+)?$/.exec(req.params.slug);
      if(!match||!Number.isSafeInteger(Number(match[1])))throw Object.assign(new Error(tr('common:unavailable')),{status:404});
      const id=Number(match[1]);
      if(req.query.reviewLanguage && cookbook.canReview(id,req.user)){res.locals.publicWebsite=false;return next();}
      let recipe;try{recipe=cookbook.get(id,req.language,req.user);}catch(error){if(error.status===404&&cookbook.canReview(id,req.user)&&/^\d+$/.test(req.params.slug)){res.locals.publicWebsite=false;return next();}throw error;}
      if('/community/'+req.params.slug!==recipe.href)return res.redirect(301,recipe.href);
      const versions=cookbook.versions(id);
      const readCounts=req.user?reads.record(req.user,id,true):null;
      render(req,res,'public/recipe',{recipe,readCounts,canManage:cookbook.canReview(id,req.user)},seo.recipe(recipe,versions));
    },
    image(req,res,next){
      const id=Number(req.params.publicId),index=Number(req.params.index);
      if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(index)||index<0)throw Object.assign(new Error(tr('common:unavailable')),{status:404});
      if(req.query.reviewLanguage&&cookbook.canReview(id,req.user)){res.locals.publicWebsite=false;return next();}
      if(!/^[1-9]\d*$/.test(req.params.publicId)||!/^\d+$/.test(req.params.index))throw Object.assign(new Error(tr('common:unavailable')),{status:404});
      const filename=cookbook.image(id,index,req.language,req.query.size==='small');
      res.removeHeader('X-Robots-Tag');res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).type('webp').sendFile(path.resolve(config.uploadDir,filename),error=>{
        if(error){if(res.headersSent)return next(error);next(Object.assign(new Error(tr('common:unavailable')),{status:404}));}
      });
    },
    information(req,res){
      const page=req.params.page;
      const metadata=seo.metadata(req.language,'/'+page,tr('public:'+page+'Title')+' · Moja kuhinja',tr('public:'+page+'Description'));
      if(page==='register')metadata.robots='noindex, follow';
      render(req,res,'public/information',{page,legal:config.legal||{}},metadata);
    },
    sitemap(req,res){
      const entries=cookbook.indexable();
      for(const route of ['welcome','community','about','contact','privacy','legal'])for(const language of languages)entries.push({id:'page-'+route,language,href:'/'+route});
      res.removeHeader('X-Robots-Tag');res.type('application/xml').send(seo.sitemap(entries));
    },
    robots(req,res){
      const privatePaths=['kitchen','suggestions','recipes','settings','super-admin','admin','workspace','workspaces','planner','shopping','submissions','login','join','images','ingredients'];
      const rules=privatePaths.flatMap(route=>['',...languages].map(language=>`Disallow: /${language?language+'/':''}${route}`));
      res.removeHeader('X-Robots-Tag');res.type('text/plain').send('User-agent: *\nAllow: /\nAllow: /images/landing-pasta.webp\n'+rules.join('\n')+'\nSitemap: '+seo.origin+'/sitemap.xml\n');
    },
    alias(req,res){res.redirect(301,'/community');},
  };
}
