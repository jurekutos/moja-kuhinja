import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireSuperAdmin,verifyCsrf } from '../middleware/security.js';
import { publicLibraryService,versionToken } from '../services/public-library.js';
import { globalCatalogService } from '../services/global-catalog.js';
import { emptyRecipe } from '../validators/recipe.js';
import { MAX_IMAGE_SIZE } from '../services/images.js';
import { tr } from '../i18n/index.js';

export function publicLibraryRoutes(db,config) {
  const router=Router(),service=publicLibraryService(db,config.uploadDir),catalog=globalCatalogService(db);
  const editor=(req,res,row=null,errors=[],body=null)=>{
    const recipe=row?{...JSON.parse(row.snapshot),originalLanguage:row.language}: {...emptyRecipe(),originalLanguage:req.language};
    if(body){Object.assign(recipe,body);try{const ingredients=JSON.parse(body.ingredientsJson),steps=JSON.parse(body.stepsJson);recipe.ingredients=Array.isArray(ingredients)?ingredients.filter(i=>i&&typeof i==='object'):[];recipe.steps=Array.isArray(steps)?steps.filter(s=>typeof s==='string'):[];}catch{recipe.ingredients=[];recipe.steps=[];}}
    return res.render('library/form',{title:tr(req.path.startsWith('/super-admin')?'library:manage':'library:suggest'),recipe,row,version:body?.version|| (row?versionToken(row):''),errors,admin:req.path.startsWith('/super-admin'),categories:catalog.list('categories',req.language,true),selected:body?[body.categoryIds||[]].flat().map(Number):recipe.globalCategoryIds||[]});
  };
  router.get('/suggestions/new',(req,res)=>editor(req,res));
  router.post('/suggestions',rateLimit({windowMs:3600000,limit:20}),verifyCsrf,(req,res)=>{
    try{service.suggest(req.user,req.body);req.session.flash=tr('library:sent');res.redirect('/submissions');}catch(error){if(error.status!==422)throw error;res.status(422);editor(req,res,null,[error.message],req.body);}
  });
  router.use('/super-admin/public-recipes',requireSuperAdmin);
  router.get('/super-admin/public-recipes',(req,res)=>res.render('library/index',{title:tr('library:manage'),rows:service.list(req.user,req.language),featured:service.featured(req.language)}));
  router.get('/super-admin/public-recipes/new',(req,res)=>editor(req,res));
  router.post('/super-admin/public-recipes',verifyCsrf,(req,res)=>{
    try{const id=service.save(req.user,req.body);req.session.flash=tr('library:saved');res.redirect(`/super-admin/public-recipes/${id}/edit?contentLanguage=${req.body.originalLanguage}`);}catch(error){if(error.status!==422)throw error;res.status(422);editor(req,res,null,[error.message],req.body);}
  });
  router.post('/super-admin/public-recipes/featured',verifyCsrf,(req,res)=>{service.feature(req.user,req.language,[req.body.first,req.body.second,req.body.third].map(Number));req.session.flash=tr('library:saved');res.redirect('/super-admin/public-recipes');});
  router.param('publicationId',(req,res,next,value)=>{if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))throw Object.assign(new Error(tr('library:missing')),{status:404});next();});
  const contentLanguage=req=>req.body?.contentLanguage||req.query.contentLanguage||req.language;
  router.get('/super-admin/public-recipes/:publicationId/edit',(req,res)=>editor(req,res,service.version(Number(req.params.publicationId),contentLanguage(req))));
  router.post('/super-admin/public-recipes/:publicationId',verifyCsrf,(req,res)=>{
    const id=Number(req.params.publicationId),row=service.version(id,contentLanguage(req));
    if(req.body.originalLanguage!==row.language)throw Object.assign(new Error(tr('library:invalid')),{status:422});
    try{service.save(req.user,req.body,id);req.session.flash=tr('library:saved');res.redirect(`/super-admin/public-recipes/${id}/edit?contentLanguage=${row.language}`);}catch(error){if(error.status!==422)throw error;res.status(422);editor(req,res,row,[error.message],req.body);}
  });
  router.post('/super-admin/public-recipes/:publicationId/moderate',verifyCsrf,(req,res)=>{service.moderate(req.user,Number(req.params.publicationId),contentLanguage(req),req.body.decision,req.body.feedback||'',req.body.version);req.session.flash=tr('library:saved');res.redirect('/super-admin/public-recipes');});
  const upload=multer({storage:multer.memoryStorage(),limits:{files:5,fileSize:MAX_IMAGE_SIZE,fields:3,parts:8}}).array('images',5);
  router.post('/super-admin/public-recipes/:publicationId/images',rateLimit({windowMs:60000,limit:20}),upload,verifyCsrf,async(req,res)=>{await service.upload(req.user,Number(req.params.publicationId),contentLanguage(req),req.files||[],req.body.version);res.redirect(`/super-admin/public-recipes/${req.params.publicationId}/edit?contentLanguage=${contentLanguage(req)}`);});
  router.post('/super-admin/public-recipes/:publicationId/images/:index/delete',verifyCsrf,async(req,res)=>{await service.removeImage(req.user,Number(req.params.publicationId),contentLanguage(req),Number(req.params.index),req.body.version);res.redirect(`/super-admin/public-recipes/${req.params.publicationId}/edit?contentLanguage=${contentLanguage(req)}`);});
  return router;
}
