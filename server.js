require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');
const slugify = require('slugify');
const methodOverride = require('method-override');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const RENDER_HOSTNAME = process.env.RENDER_EXTERNAL_HOSTNAME || '';
const SITE_URL = (process.env.SITE_URL || (RENDER_HOSTNAME ? `https://${RENDER_HOSTNAME}` : `http://localhost:${PORT}`)).replace(/\/$/, '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(__dirname, 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const ADMIN_USER = process.env.ADMIN_USER || 'editor';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeThisStrongPassword';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-this-secret';
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);
const SOURCE_DOMAINS = ['hirunews.lk', 'adaderana.lk'];

// Render and other reverse proxies terminate HTTPS before forwarding to Node.
// Trust one proxy hop so secure admin-session cookies work correctly in production.
if (IS_PRODUCTION) app.set('trust proxy', 1);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
let articlesCache = readJson(ARTICLES_FILE, []);
let settingsCache = readJson(SETTINGS_FILE, {});
let articleWriteTimer = null;
function getArticles() { return articlesCache; }
function saveArticles(a) {
  articlesCache = a;
  if (articleWriteTimer) { clearTimeout(articleWriteTimer); articleWriteTimer = null; }
  writeJson(ARTICLES_FILE, articlesCache);
}
function scheduleArticlesSave() {
  if (articleWriteTimer) clearTimeout(articleWriteTimer);
  articleWriteTimer = setTimeout(() => {
    writeJson(ARTICLES_FILE, articlesCache);
    articleWriteTimer = null;
  }, 1200);
  if (articleWriteTimer.unref) articleWriteTimer.unref();
}
function getSettings() { return settingsCache; }
function saveSettings(s) { settingsCache = s; writeJson(SETTINGS_FILE, settingsCache); }
function visibleArticles() {
  const now = new Date();
  return getArticles().filter(a => {
    if (a.status === 'published') return true;
    if (a.status === 'scheduled' && a.scheduledAt && new Date(a.scheduledAt) <= now) return true;
    return false;
  }).sort((a,b) => new Date(b.publishedAt || b.scheduledAt || b.createdAt) - new Date(a.publishedAt || a.scheduledAt || a.createdAt));
}
function readingTime(html='') {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
function youtubeEmbed(url='') {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : '';
}
function cleanBody(html='') {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','iframe','figure','figcaption','video','source']),
    allowedAttributes: {
      '*': ['class','id','title'],
      a: ['href','name','target','rel'],
      img: ['src','alt','width','height','loading'],
      iframe: ['src','width','height','frameborder','allow','allowfullscreen'],
      video: ['src','controls','poster','preload'],
      source: ['src','type']
    },
    allowedSchemes: ['http','https','data']
  });
}
function normalizeHttpUrl(value='') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!['http:','https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch { return ''; }
}
const CATEGORY_IMAGES = {
  Local: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Colombo_city_skyline.png/960px-Colombo_city_skyline.png',
  World: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3e/World_Map_Land.png/960px-World_Map_Land.png',
  Business: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/85/Meeting_public.jpg/960px-Meeting_public.jpg',
  Markets: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Stock_market_Image_public_domain.jpg',
  Sports: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Wayanad_Cricket_Stadium.png/960px-Wayanad_Cricket_Stadium.png',
  Entertainment: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Concert_crowd_%28Unsplash%29.jpg/960px-Concert_crowd_%28Unsplash%29.jpg',
  Technology: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/Artificial-Intelligence.jpg/960px-Artificial-Intelligence.jpg',
  Reports: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Stock_market_Image_public_domain.jpg'
};
const SPECIAL_IMAGES = {
  train: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Sri_LAnks_Old_Train.jpg/960px-Sri_LAnks_Old_Train.jpg'
};
function isCompetitorMedia(value='') {
  try {
    const host = new URL(value).hostname.replace(/^www\./,'');
    return SOURCE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch { return false; }
}
function articleImage(article={}) {
  if (article.coverImage) return article.coverImage;
  if (article.coverImageUrl && !isCompetitorMedia(article.coverImageUrl)) return article.coverImageUrl;
  const haystack = `${article.slug || ''} ${article.title || ''}`.toLowerCase();
  if (/train|rail|දුම්රිය/.test(haystack)) return SPECIAL_IMAGES.train;
  return CATEGORY_IMAGES[article.category] || CATEGORY_IMAGES.Local;
}
function absoluteMedia(url='') { return /^https?:\/\//i.test(url) ? url : (url ? SITE_URL + url : ''); }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function decodeEntities(value='') {
  return String(value)
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&#x2F;/g,'/');
}
function metaValue(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i')
  ];
  for (const p of patterns) { const m = html.match(p); if (m) return decodeEntities(m[1].trim()); }
  return '';
}
function titleValue(html='') {
  return metaValue(html,'og:title') || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g,' ').trim());
}
function sourceNameFromUrl(value='') {
  try {
    const host = new URL(value).hostname.replace(/^www\./,'');
    if (host.endsWith('hirunews.lk')) return 'Hiru News';
    if (host.includes('adaderana.lk')) return 'Ada Derana';
    return host;
  } catch { return 'Source'; }
}
function isAllowedSource(value='') {
  try {
    const u = new URL(value);
    return ['http:','https:'].includes(u.protocol) && SOURCE_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}
function sourceCandidates(sourceUrl='') {
  const out=[sourceUrl];
  try {
    const u=new URL(sourceUrl);
    const host=u.hostname.replace(/^www\./,'');
    if(host.endsWith('hirunews.lk')){
      const sinhalaPath=u.pathname.replace(/^\/en\//,'/').replace(/^\/english\//,'/');
      const sinhala=`${u.protocol}//${u.hostname}${sinhalaPath}${u.search}`;
      if(sinhala!==sourceUrl) out.unshift(sinhala);
    }
  } catch {}
  return [...new Set(out)];
}
async function fetchSourcePreview(sourceUrl) {
  if (!isAllowedSource(sourceUrl)) throw new Error('Quick Import සඳහා Hiru News හෝ Ada Derana සබැඳියක් පමණක් භාවිත කරන්න.');
  let lastError;
  for (const candidate of sourceCandidates(sourceUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(candidate, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          'Accept-Language':'si-LK,si;q=0.9,en;q=0.7'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('text/html')) throw new Error('මෙය සාමාන්‍ය web article පිටුවක් නොවේ.');
      const html = await response.text();
      const title = titleValue(html).replace(/\s*[-|]\s*(Hiru News|Ada Derana).*$/i,'').trim();
      const summary = (metaValue(html,'og:description') || metaValue(html,'description')).replace(/\s+/g,' ').trim().slice(0,360);
      const image = normalizeHttpUrl(metaValue(html,'og:image'));
      const published = metaValue(html,'article:published_time') || metaValue(html,'datePublished');
      if (title || summary || image) return { sourceUrl, fetchedUrl:candidate, sourceName:sourceNameFromUrl(sourceUrl), title, summary, image, published };
      throw new Error('පුවත් තොරතුරු හඳුනාගත නොහැකි විය.');
    } catch (err) { lastError=err; }
    finally { clearTimeout(timer); }
  }
  throw new Error(`මූලාශ්‍රය ස්වයංක්‍රීයව කියවිය නොහැකි විය. Manual source draft භාවිත කරන්න. ${lastError?.message||''}`.trim());
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = slugify(path.basename(file.originalname, ext), {lower:true, strict:true}) || 'file';
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /^(image\/|video\/|application\/pdf$)/.test(file.mimetype);
    cb(allowed ? null : new Error('පින්තූර, වීඩියෝ සහ PDF ගොනු පමණක් upload කළ හැක.'), allowed);
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(helmet({contentSecurityPolicy:false, crossOriginEmbedderPolicy:false}));
// Static assets bypass the dynamic request limiter and get browser caching.
app.use(express.static(path.join(__dirname, 'public'), {maxAge:'1d', etag:true}));
app.use(rateLimit({windowMs: 60 * 1000, limit: 240, standardHeaders:true, legacyHeaders:false}));
app.use(express.urlencoded({extended:true, limit:'2mb'}));
app.use(express.json({limit:'2mb'}));
app.use(methodOverride('_method'));
app.use(session({
  secret:SESSION_SECRET,
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true, sameSite:'lax', secure:IS_PRODUCTION, maxAge:8*60*60*1000}
}));

app.locals.siteUrl = SITE_URL;
app.locals.readingTime = readingTime;
app.locals.youtubeEmbed = youtubeEmbed;
app.locals.encodeURIComponent = encodeURIComponent;
app.locals.articleImage = articleImage;
app.locals.absoluteMedia = absoluteMedia;
const CATEGORY_LABELS={Latest:'නවතම',Local:'දේශීය',World:'විදෙස්',Business:'ව්‍යාපාර',Markets:'වෙළෙඳපොළ',Sports:'ක්‍රීඩා',Entertainment:'විනෝදාස්වාද',Technology:'තාක්ෂණ',Reports:'විශේෂ වාර්තා'};
app.locals.categoryLabel = (category) => CATEGORY_LABELS[category] || category;
app.locals.formatDate = (date) => new Intl.DateTimeFormat('si-LK',{dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Colombo'}).format(new Date(date));

const loginLimiter = rateLimit({windowMs:15*60*1000, limit:10, message:'පිවිසීමේ උත්සාහ වැඩියි. ටික වේලාවකින් නැවත උත්සාහ කරන්න.'});
function requireAdmin(req,res,next){ if(req.session.admin) return next(); res.redirect('/admin/login'); }

// Breaking news is rendered server-side. Avoid a permanent SSE connection so browser back/forward cache stays fast.
app.use((req,res,next)=>{
  res.locals.settings = getSettings();
  res.locals.currentPath = req.path;
  res.locals.adminLoggedIn = !!req.session.admin;
  next();
});

// Lightweight hosting health check used by Render.
app.get('/health', (req,res) => res.status(200).json({ok:true, service:'ctn-news-portal'}));

app.get('/', (req,res) => {
  const articles = visibleArticles();
  const featured = articles.find(a=>a.featured) || articles[0];
  const breaking = articles.filter(a=>a.breaking).slice(0,8);
  const latest = articles.filter(a=>!featured || a.id !== featured.id).slice(0,16);
  const mostRead = [...articles].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,6);
  const videos = articles.filter(a=>a.videoUrl || a.videoFile).slice(0,6);
  const categories = getSettings().categories || [];
  const categorySections = categories.filter(c=>c!=='Latest').map(category=>({
    category,
    articles: articles.filter(a=>a.category===category).slice(0,4)
  })).filter(s=>s.articles.length);
  res.render('home',{featured,breaking,latest,mostRead,videos,categorySections,meta:{title:'Capital Trust News',description:'ශ්‍රී ලංකාවේ සහ ලෝකයේ නවතම පුවත්, ව්‍යාපාර, වෙළෙඳපොළ, ක්‍රීඩා සහ තාක්ෂණික තොරතුරු සිංහලෙන්.'}});
});

app.get('/news', (req,res) => {
  let articles = visibleArticles();
  const category = (req.query.category||'').trim();
  const q = (req.query.q||'').trim().toLowerCase();
  const tag = (req.query.tag||'').trim().toLowerCase();
  if(category && category !== 'Latest') articles = articles.filter(a=>a.category===category);
  if(tag) articles = articles.filter(a=>(a.tags||[]).some(t=>t.toLowerCase()===tag));
  if(q) articles = articles.filter(a=>`${a.title} ${a.summary} ${a.body} ${(a.tags||[]).join(' ')}`.toLowerCase().includes(q));
  const title = category === 'Latest' ? 'නවතම පුවත්' : category ? `${CATEGORY_LABELS[category] || category} පුවත්` : 'සියලු පුවත්';
  res.render('listing',{articles,category,q,tag,meta:{title,description:'Capital Trust News හි සිංහල පුවත් කියවන්න.'}});
});

app.get('/article/:slug', (req,res) => {
  const articles = visibleArticles();
  const indexAll = getArticles();
  const article = articles.find(a=>a.slug===req.params.slug);
  if(!article) return res.status(404).render('404',{meta:{title:'පුවත හමු නොවීය'}});
  const idx = indexAll.findIndex(a=>a.id===article.id);
  if(idx>=0){ indexAll[idx].views=(indexAll[idx].views||0)+1; article.views=indexAll[idx].views; scheduleArticlesSave(); }
  const related = articles.filter(a=>a.id!==article.id && (a.category===article.category || (a.tags||[]).some(t=>(article.tags||[]).includes(t)))).slice(0,4);
  const image = absoluteMedia(articleImage(article));
  res.render('article',{article,related,meta:{title:article.seoTitle||article.title,description:article.seoDescription||article.summary,image}});
});

app.get('/api/breaking', (req,res) => {
  res.json(visibleArticles().filter(a=>a.breaking).slice(0,8).map(a=>({title:a.title,url:`/article/${a.slug}`})));
});

app.get('/rss.xml',(req,res)=>{
  const items = visibleArticles().slice(0,50).map(a=>`<item><title><![CDATA[${a.title}]]></title><link>${SITE_URL}/article/${a.slug}</link><guid>${SITE_URL}/article/${a.slug}</guid><pubDate>${new Date(a.publishedAt||a.createdAt).toUTCString()}</pubDate><description><![CDATA[${a.summary||''}]]></description></item>`).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Capital Trust News</title><link>${SITE_URL}</link><description>Capital Trust News</description>${items}</channel></rss>`);
});
app.get('/sitemap.xml',(req,res)=>{
  const urls=[`${SITE_URL}/`,`${SITE_URL}/news`,...visibleArticles().map(a=>`${SITE_URL}/article/${a.slug}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${u}</loc></url>`).join('')}</urlset>`);
});
app.get('/robots.txt',(req,res)=>res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`));

// Admin
app.get('/admin/login',(req,res)=>res.render('admin/login',{error:null,meta:{title:'සංස්කාරක පිවිසුම'}}));
app.post('/admin/login',loginLimiter,(req,res)=>{
  const okUser = req.body.username===ADMIN_USER;
  const okPass = bcrypt.compareSync(req.body.password||'',ADMIN_HASH);
  if(okUser && okPass){ req.session.admin=true; return res.redirect('/admin'); }
  res.status(401).render('admin/login',{error:'පරිශීලක නාමය හෝ මුරපදය වැරදියි.',meta:{title:'සංස්කාරක පිවිසුම'}});
});
app.post('/admin/logout',(req,res)=>req.session.destroy(()=>res.redirect('/admin/login')));

app.get('/admin',requireAdmin,(req,res)=>{
  const articles=getArticles().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  const categories=(getSettings().categories||[]).filter(c=>c!=='Latest');
  const stats={
    total:articles.length,
    published:articles.filter(a=>a.status==='published').length,
    drafts:articles.filter(a=>a.status==='draft').length,
    scheduled:articles.filter(a=>a.status==='scheduled').length,
    views:articles.reduce((n,a)=>n+(a.views||0),0),
    top:[...articles].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5),
    byCategory:categories.map(category=>({category,count:articles.filter(a=>a.category===category).length}))
  };
  res.render('admin/dashboard',{articles,stats,meta:{title:'CTN පාලක පුවරුව'}});
});
app.get('/admin/articles/new',requireAdmin,(req,res)=>res.render('admin/editor',{article:null,meta:{title:'නව පුවත'}}));
app.get('/admin/articles/:id/edit',requireAdmin,(req,res)=>{
  const article=getArticles().find(a=>a.id===req.params.id);
  if(!article) return res.status(404).send('පුවත හමු නොවීය');
  res.render('admin/editor',{article,meta:{title:`සංස්කරණය: ${article.title}`}});
});

// Quick source import: metadata only. The editor reviews/re-writes before publishing.
app.get('/admin/import',requireAdmin,(req,res)=>res.render('admin/import',{preview:null,error:null,meta:{title:'පුවත් මූලාශ්‍රයක් ඇතුළත් කරන්න'}}));
app.post('/admin/import/preview',requireAdmin,async(req,res)=>{
  try {
    const preview=await fetchSourcePreview((req.body.sourceUrl||'').trim());
    res.render('admin/import',{preview,error:null,meta:{title:'පුවත් මූලාශ්‍රයක් ඇතුළත් කරන්න'}});
  } catch(err) {
    res.status(400).render('admin/import',{preview:null,error:err.message,meta:{title:'පුවත් මූලාශ්‍රයක් ඇතුළත් කරන්න'}});
  }
});
app.post('/admin/import/create',requireAdmin,(req,res)=>{
  const sourceUrl=normalizeHttpUrl(req.body.sourceUrl);
  if(!isAllowedSource(sourceUrl)) return res.status(400).send('වලංගු Hiru/Ada Derana මූලාශ්‍ර URL එකක් ලබාදෙන්න.');
  const articles=getArticles();
  const now=new Date().toISOString();
  let slug=slugify(req.body.title||'imported-news',{lower:true,strict:true}) || `article-${Date.now()}`;
  if(articles.some(a=>a.slug===slug)) slug=`${slug}-${Date.now().toString().slice(-5)}`;
  const summary=(req.body.summary||'').trim().slice(0,360);
  const sourceName=(req.body.sourceName||sourceNameFromUrl(sourceUrl)).trim().slice(0,80);
  const category=(req.body.category||'Local').trim();
  const item={
    id:crypto.randomUUID(),slug,title:(req.body.title||'Imported story').trim(),summary,
    body:cleanBody(`<p><strong>CTN කෙටි පුවත:</strong> පහත මූලාශ්‍ර තොරතුරු මත මෙම කෙටුම්පත සකස් කර ඇත. ප්‍රකාශයට පත් කිරීමට පෙර කරුණු තහවුරු කර සිංහලෙන් සංස්කරණය කරන්න.</p>${summary?`<p>${escapeHtml(summary)}</p>`:''}`),
    category,tags:[],coverImage:'',coverImageUrl:'',videoUrl:'',videoFile:'',documentFile:'',
    author:'CTN සංස්කාරක මණ්ඩලය',status:'draft',featured:false,breaking:false,scheduledAt:'',publishedAt:'',createdAt:now,updatedAt:now,views:0,
    seoTitle:(req.body.title||'').trim().slice(0,65),seoDescription:summary.slice(0,160),sourceName,sourceUrl,sourcePublishedAt:(req.body.sourcePublishedAt||'').trim()
  };
  articles.push(item); saveArticles(articles); res.redirect(`/admin/articles/${item.id}/edit`);
});

const articleUpload = upload.fields([{name:'coverImage',maxCount:1},{name:'videoFile',maxCount:1},{name:'documentFile',maxCount:1}]);
app.post('/admin/articles',requireAdmin,articleUpload,(req,res)=>saveArticle(req,res,false));
app.post('/admin/articles/:id',requireAdmin,articleUpload,(req,res)=>saveArticle(req,res,true));
function saveArticle(req,res,isEdit){
  const articles=getArticles();
  const existing=isEdit?articles.find(a=>a.id===req.params.id):null;
  if(isEdit && !existing) return res.status(404).send('පුවත හමු නොවීය');
  const now=new Date().toISOString();
  let slug=slugify(req.body.slug||req.body.title||'',{lower:true,strict:true});
  if(!slug) slug=`article-${Date.now()}`;
  const duplicate=articles.find(a=>a.slug===slug && (!existing || a.id!==existing.id));
  if(duplicate) slug=`${slug}-${Date.now().toString().slice(-5)}`;
  const files=req.files||{};
  const status=req.body.status||'draft';
  const item={
    id: existing?.id || crypto.randomUUID(),
    slug,
    title:(req.body.title||'ශීර්ෂයක් නොමැත').trim(),
    summary:(req.body.summary||'').trim(),
    body:cleanBody(req.body.body||''),
    category:req.body.category||'Local',
    tags:(req.body.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
    coverImage:files.coverImage?.[0]?`/uploads/${files.coverImage[0].filename}`:(existing?.coverImage||''),
    coverImageUrl:normalizeHttpUrl(req.body.coverImageUrl||''),
    videoUrl:normalizeHttpUrl(req.body.videoUrl||''),
    videoFile:files.videoFile?.[0]?`/uploads/${files.videoFile[0].filename}`:(existing?.videoFile||''),
    documentFile:files.documentFile?.[0]?`/uploads/${files.documentFile[0].filename}`:(existing?.documentFile||''),
    author:(req.body.author||'CTN සංස්කාරක මණ්ඩලය').trim(),
    status,
    featured:req.body.featured==='on',
    breaking:req.body.breaking==='on',
    scheduledAt:req.body.scheduledAt?new Date(req.body.scheduledAt).toISOString():'',
    publishedAt: existing?.publishedAt || (status==='published'?now:''),
    createdAt:existing?.createdAt||now,
    updatedAt:now,
    views:existing?.views||0,
    seoTitle:(req.body.seoTitle||'').trim(),
    seoDescription:(req.body.seoDescription||'').trim(),
    sourceName:(req.body.sourceName||'').trim(),
    sourceUrl:normalizeHttpUrl(req.body.sourceUrl||''),
    sourcePublishedAt:(req.body.sourcePublishedAt||'').trim()
  };
  if(status==='published' && !item.publishedAt) item.publishedAt=now;
  if(existing){ Object.assign(existing,item); } else { articles.push(item); }
  saveArticles(articles);
  res.redirect('/admin');
}

app.post('/admin/articles/:id/delete',requireAdmin,(req,res)=>{
  const articles=getArticles();
  saveArticles(articles.filter(a=>a.id!==req.params.id));
  res.redirect('/admin');
});

app.get('/admin/settings',requireAdmin,(req,res)=>res.render('admin/settings',{meta:{title:'වෙබ් අඩවි සැකසුම්'}}));
app.post('/admin/settings',requireAdmin,(req,res)=>{
  const s=getSettings();
  s.siteName=(req.body.siteName||s.siteName).trim();
  s.siteShortName=(req.body.siteShortName||s.siteShortName).trim();
  s.tagline=(req.body.tagline||s.tagline).trim();
  s.footerText=(req.body.footerText||s.footerText).trim();
  s.categories=(req.body.categories||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!s.categories.includes('Latest')) s.categories.unshift('Latest');
  s.tickerItems=[1,2,3].map(i=>({label:(req.body[`tickerLabel${i}`]||'').trim(),value:(req.body[`tickerValue${i}`]||'').trim()})).filter(x=>x.label);
  saveSettings(s);
  res.redirect('/admin/settings');
});

app.use((err,req,res,next)=>{
  console.error(err);
  if(err instanceof multer.MulterError || /පින්තූර|Only images/.test(err.message)) return res.status(400).send(err.message);
  res.status(500).send('දෝෂයක් ඇතිවිය. නැවත උත්සාහ කරන්න.');
});
app.use((req,res)=>res.status(404).render('404',{meta:{title:'පිටුව හමු නොවීය'}}));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`CTN News Portal running on ${SITE_URL}`);
  if (IS_PRODUCTION && (ADMIN_PASSWORD === 'ChangeThisStrongPassword' || SESSION_SECRET === 'dev-only-change-this-secret')) {
    console.warn('WARNING: Change ADMIN_PASSWORD and SESSION_SECRET before public use.');
  }
});

function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down CTN cleanly...`);
  if (articleWriteTimer) {
    clearTimeout(articleWriteTimer);
    articleWriteTimer = null;
    try { writeJson(ARTICLES_FILE, articlesCache); } catch (err) { console.error('Final article save failed:', err); }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
