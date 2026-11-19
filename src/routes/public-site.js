import { recipeReadService } from '../services/recipe-reads.js';
import { Router } from 'express';
import { publicCookbook } from '../services/public-cookbook.js';
import { seoService } from '../services/seo.js';
import { publicSiteController } from '../controllers/public-site.js';

export function publicSiteRoutes(db,config){
  const router=Router(),controller=publicSiteController(publicCookbook(db),seoService(config),config,recipeReadService(db));
  const markPublic=(req,res,next)=>{res.locals.publicWebsite=true;next();};
  router.get('/robots.txt',markPublic,controller.robots);
  router.get('/sitemap.xml',markPublic,controller.sitemap);
  router.get('/welcome',markPublic,controller.landing);
  router.get('/',markPublic,controller.landing);
  router.get('/community',markPublic,controller.directory);
  router.get('/recepti',markPublic,controller.alias);
  router.get('/rezepte',markPublic,controller.alias);
  router.get('/community/:publicId/images/:index',markPublic,controller.image);
  router.get('/community/:slug',markPublic,controller.detail);
  for(const page of ['about','contact','privacy','legal','register'])router.get('/'+page,markPublic,(req,res)=>{req.params.page=page;controller.information(req,res);});
  return router;
}
