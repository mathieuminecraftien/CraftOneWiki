import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import multer from 'multer';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, 'data', 'articles.json');
const categoriesFile = path.join(__dirname, 'data', 'categories.json');
const adminsFile = path.join(__dirname, 'data', 'admins.json');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const protectedAdminIds = (process.env.DISCORD_STAFF_USER_IDS || '1094392180900110457').split(',').map(id => id.trim()).filter(Boolean);
const discordRedirectUri = process.env.DISCORD_REDIRECT_URI ? process.env.DISCORD_REDIRECT_URI.replace(/([^:]\/)(\/+)/g, '$1').replace(/\/+$/, '') : '';

app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-only-change-this', resave: false, saveUninitialized: false, cookie: { maxAge: 1000 * 60 * 60 * 8 } }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/vendor/quill', express.static(path.join(__dirname, 'node_modules', 'quill', 'dist')));

async function readData(file, fallback = []) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return []; }
}
async function writeData(file, data) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(data, null, 2)); }
const articles = () => readData(dataFile);
const categories = () => readData(categoriesFile);
const admins = () => readData(adminsFile);
async function allowedAdminIds() { return new Set([...protectedAdminIds, ...(await admins()).map(admin => admin.id)]); }
async function isStaff(req) { return req.session.user?.staff === true && (await allowedAdminIds()).has(req.session.user.id); }
async function canManageUsers(req) {
  if (!(await isStaff(req))) return false;
  if (protectedAdminIds.includes(req.session.user.id)) return true;
  const list = await admins();
  const admin = list.find(a => a.id === req.session.user.id);
  return admin?.manageUsers === true;
}
function avatarUrl(id, avatar) { return avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 5n)}.png`; }
async function rememberAdmin(user) {
  const list = await admins();
  const index = list.findIndex(admin => admin.id === user.id);
  const existingManageUsers = index >= 0 ? list[index].manageUsers === true : false;
  const entry = { id: user.id, name: user.name, avatar: user.avatarUrl, manageUsers: protectedAdminIds.includes(user.id) || existingManageUsers, updatedAt: new Date().toISOString() };
  if (index >= 0) list[index] = { ...list[index], ...entry };
  else if (protectedAdminIds.includes(user.id)) list.unshift(entry);
  else list.push(entry);
  await writeData(adminsFile, list);
}
async function requireStaff(req, res, next) { if (!(await isStaff(req))) return res.status(403).json({ error: 'Accès réservé aux comptes Discord administrateurs.' }); next(); }
async function requireUserManager(req, res, next) { if (!(await canManageUsers(req))) return res.status(403).json({ error: 'Accès réservé aux gestionnaires d’utilisateurs.' }); next(); }
function clean(value, length = 3000) { return typeof value === 'string' ? value.trim().slice(0, length) : ''; }
function slugify(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'article'; }
function uniqueSlug(title, list, excludeId = '') { const base = slugify(title); let slug = base, number = 2; while (list.some(a => a.id !== excludeId && (a.slug || slugify(a.title)) === slug)) slug = `${base}-${number++}`; return slug; }
function withSlug(article) { return article.slug ? article : { ...article, slug: slugify(article.title) }; }
const upload = multer({ storage: multer.diskStorage({ destination: async (_req, _file, callback) => { await mkdir(uploadsDir, { recursive: true }); callback(null, uploadsDir); }, filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(null, /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) });

app.get('/api/articles', async (req, res) => res.json((await articles()).map(withSlug)));
app.get('/api/articles/slug/:slug', async (req, res) => { const article = (await articles()).map(withSlug).find(a => a.slug === req.params.slug); if (!article) return res.status(404).json({ error: 'Article introuvable.' }); res.json(article); });
app.get('/api/categories', async (req, res) => res.json(await categories()));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null, discordReady: Boolean(process.env.DISCORD_CLIENT_ID) }));
app.get('/api/admins', requireStaff, async (_req, res) => {
  const list = await admins();
  const merged = protectedAdminIds.map(id => {
    const admin = list.find(admin => admin.id === id);
    return admin ? { ...admin, protected: true, manageUsers: true } : { id, name: 'Administrateur principal', avatar: avatarUrl(id, null), protected: true, manageUsers: true };
  }).concat(list.filter(admin => !protectedAdminIds.includes(admin.id)).map(admin => ({ ...admin, protected: false, manageUsers: admin.manageUsers === true })));
  res.json(merged);
});
app.post('/api/admins', requireUserManager, async (req, res) => {
  const id = clean(req.body.id, 24);
  if (!/^\d{17,20}$/.test(id)) return res.status(400).json({ error: 'Saisissez un ID Discord valide.' });
  if ((await allowedAdminIds()).has(id)) return res.status(409).json({ error: 'Ce compte est déjà administrateur.' });
  const list = await admins(); const admin = { id, name: 'En attente de connexion', avatar: avatarUrl(id, null), manageUsers: false, addedAt: new Date().toISOString() };
  list.push(admin); await writeData(adminsFile, list); res.status(201).json(admin);
});
app.put('/api/admins/:id', requireUserManager, async (req, res) => {
  const list = await admins();
  const index = list.findIndex(a => a.id === req.params.id);
  if (protectedAdminIds.includes(req.params.id)) return res.status(403).json({ error: 'Impossible de modifier le compte principal.' });
  if (index === -1) return res.status(404).json({ error: 'Administrateur introuvable.' });
  const manageUsers = req.body.manageUsers === true || req.body.manageUsers === 'true';
  list[index] = { ...list[index], manageUsers };
  await writeData(adminsFile, list);
  res.json(list[index]);
});
app.delete('/api/admins/:id', requireUserManager, async (req, res) => {
  const list = await admins();
  const admin = list.find(a => a.id === req.params.id);
  if (protectedAdminIds.includes(req.params.id) || admin?.protected || req.params.id === req.session.user?.id) return res.status(403).json({ error: 'Cet administrateur ne peut pas être retiré.' });
  const next = list.filter(admin => admin.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Administrateur introuvable.' });
  await writeData(adminsFile, next); res.sendStatus(204);
});
app.post('/api/articles', requireStaff, async (req, res) => {
  const title = clean(req.body.title, 100), category = clean(req.body.category, 48), excerpt = clean(req.body.excerpt, 160), body = clean(req.body.body, 200000);
  if (![title, category, excerpt, body].every(Boolean)) return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
  if (!(await categories()).some(c => c.name === category)) return res.status(400).json({ error: 'Cette catégorie n’existe pas.' });
  const list = await articles();
  const article = { id: crypto.randomUUID(), slug: uniqueSlug(title, list), title, category, excerpt, body, author: req.session.user.name, date: new Date().toISOString(), updatedAt: new Date().toISOString() };
  list.unshift(article); await writeData(dataFile, list); res.status(201).json(article);
});
app.put('/api/articles/:id', requireStaff, async (req, res) => {
  const list = await articles(), index = list.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Article introuvable.' });
  const title = clean(req.body.title, 100), category = clean(req.body.category, 48), excerpt = clean(req.body.excerpt, 160), body = clean(req.body.body, 200000);
  if (![title, category, excerpt, body].every(Boolean)) return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
  if (!(await categories()).some(c => c.name === category)) return res.status(400).json({ error: 'Cette catégorie n’existe pas.' });
  list[index] = { ...list[index], slug: uniqueSlug(title, list, list[index].id), title, category, excerpt, body, updatedAt: new Date().toISOString() };
  await writeData(dataFile, list); res.json(list[index]);
});
app.delete('/api/articles/:id', requireStaff, async (req, res) => {
  const list = await articles(), next = list.filter(a => a.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Article introuvable.' });
  await writeData(dataFile, next); res.sendStatus(204);
});
app.post('/api/uploads', requireStaff, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Seules les images JPEG, PNG, GIF et WebP sont acceptées (5 Mo maximum).' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
app.post('/api/categories', requireStaff, async (req, res) => {
  const name = clean(req.body.name, 48), description = clean(req.body.description, 120), color = clean(req.body.color, 24) || 'blue';
  if (!name || !description) return res.status(400).json({ error: 'Nom et description obligatoires.' });
  const list = await categories();
  if (list.some(c => c.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'Cette catégorie existe déjà.' });
  const category = { id: crypto.randomUUID(), name, description, color };
  list.push(category); await writeData(categoriesFile, list); res.status(201).json(category);
});
app.put('/api/categories/:id', requireStaff, async (req, res) => {
  const list = await categories(), index = list.findIndex(c => c.id === req.params.id);
  const name = clean(req.body.name, 48), description = clean(req.body.description, 120), color = clean(req.body.color, 24) || 'blue';
  if (index === -1) return res.status(404).json({ error: 'Catégorie introuvable.' });
  if (!name || !description) return res.status(400).json({ error: 'Nom et description obligatoires.' });
  if (list.some(c => c.id !== req.params.id && c.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'Cette catégorie existe déjà.' });
  const oldName = list[index].name; list[index] = { ...list[index], name, description, color };
  const articleList = await articles(); articleList.forEach(a => { if (a.category === oldName) a.category = name; });
  await writeData(categoriesFile, list); await writeData(dataFile, articleList); res.json(list[index]);
});
app.delete('/api/categories/:id', requireStaff, async (req, res) => {
  const list = await categories(), category = list.find(c => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable.' });
  if ((await articles()).some(a => a.category === category.name)) return res.status(409).json({ error: 'Déplacez ou supprimez les articles de cette catégorie avant de la supprimer.' });
  await writeData(categoriesFile, list.filter(c => c.id !== category.id)); res.sendStatus(204);
});

app.get('/auth/discord', (req, res) => {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !discordRedirectUri) return res.status(503).send('Discord n’est pas encore configuré. Renseignez le fichier .env.');
  const state = crypto.randomBytes(24).toString('hex'); req.session.oauthState = state;
  const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: discordRedirectUri, response_type: 'code', scope: 'identify', state });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});
app.get(['/auth/discord/callback', '//auth/discord/callback'], async (req, res) => {
  try {
    if (!req.query.code || req.query.state !== req.session.oauthState) throw new Error('État OAuth invalide');
    delete req.session.oauthState;
    const token = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: req.query.code, redirect_uri: discordRedirectUri }) }).then(r => r.json());
    if (!token.access_token) throw new Error('Jeton Discord introuvable');
    const user = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } }).then(r => r.json());
    const staff = (await allowedAdminIds()).has(user.id);
    const list = await admins();
    const admin = list.find(a => a.id === user.id);
    req.session.user = { id: user.id, name: user.global_name || user.username, avatar: user.avatar, avatarUrl: avatarUrl(user.id, user.avatar), staff, manageUsers: protectedAdminIds.includes(user.id) || admin?.manageUsers === true };
    if (staff) await rememberAdmin(req.session.user);
    res.redirect('/?connected=1');
  } catch { res.redirect('/?error=discord'); }
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.sendStatus(204)));

// Les articles publics sont accessibles directement par leur URL lisible.
app.get('/:slug', (req, res, next) => {
  if (req.params.slug.includes('.') || ['auth', 'api', 'uploads'].includes(req.params.slug)) return next();
  res.sendFile(path.join(__dirname, 'public', 'article.html'));
});

app.listen(process.env.PORT || 3000, () => console.log(`Wiki disponible sur http://localhost:${process.env.PORT || 3000}`));
