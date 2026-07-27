const $ = s => document.querySelector(s);
let allArticles = [], allCategories = [], allAdmins = [], me = null, quill = null;
const grid = $('#articleGrid');
const modal = $('#staffModal');
const colors = { Biomes: 'forest', Mobs: 'red', Mods: 'purple', Modpacks: 'gold', Actualités: 'blue' };

function date(value) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
const esc = value => String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[ch]);
function render(query = '') {
  if (!grid) return;
  const q = query.trim().toLowerCase();
  const list = allArticles.filter(a => !q || [a.title, a.category, a.excerpt, a.body].join(' ').toLowerCase().includes(q));
  grid.innerHTML = list.map(a => `<article class="article-card"><div class="card-top"><span class="tag ${colors[a.category] || 'blue'}">${esc(a.category)}</span><span>${date(a.date)}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><div class="card-foot"><span>par ${esc(a.author)}</span><button class="read" data-id="${a.id}">Lire <b>→</b></button></div></article>`).join('');
  const empty = $('#empty');
  if (empty) empty.hidden = Boolean(list.length);
  const count = $('#articleCount');
  if (count) count.textContent = `${allArticles.length} article${allArticles.length > 1 ? 's' : ''}`;
}
async function load() {
  [allArticles, allCategories, me] = await Promise.all([
    fetch('/api/articles').then(r => r.json()),
    fetch('/api/categories').then(r => r.json()),
    fetch('/api/me').then(r => r.json())
  ]);
  
  if (me?.user) {
    const loginBtn = $('#loginButton');
    if (loginBtn) {
      loginBtn.innerHTML = `<img src="${me.user.avatarUrl}" style="width:20px;height:20px;border-radius:50%"> ${esc(me.user.name)}`;
      loginBtn.onclick = async () => {
        if (confirm('Voulez-vous vous déconnecter ?')) {
          await fetch('/api/logout', { method: 'POST' });
          location.reload();
        }
      };
    }
  } else {
    $('#loginButton').onclick = () => location.href = '/auth/discord';
  }
  
  render();
}
function showLogin() { $('#modalTitle').textContent = 'Connexion staff'; $('#modalContent').replaceChildren($('#loginTemplate').content.cloneNode(true)); }
function setPanel(panel) { document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.panel === panel)); document.querySelectorAll('.panel').forEach(s => s.classList.toggle('active', s.id === panel)); }
function fillCategorySelect(selected = '') { $('#categorySelect').innerHTML = allCategories.map(c => `<option ${c.name === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join(''); }
async function loadAdmins() {
  const adminList = $('#adminList');
  if (!adminList) return;
  const response = await fetch('/api/admins');
  if (!response.ok) { adminList.innerHTML = '<p class="empty">Impossible de charger les administrateurs.</p>'; return; }
  allAdmins = await response.json();
  const currentAdminId = me?.user?.id;
  adminList.innerHTML = allAdmins.map(admin => {
    const isCurrentUser = admin.id === currentAdminId;
    const canRemove = !admin.protected && !isCurrentUser;
    const action = admin.protected ? '<span class="badge">Principal</span>' : (isCurrentUser ? '<span class="badge">Vous</span>' : `<button class="danger" data-delete-admin="${esc(admin.id)}">Retirer</button>`);
    return `<div class="admin-row"><div class="admin-user"><img class="avatar-image" src="${esc(admin.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="${esc(admin.name || admin.id)}" /><div><strong>${esc(admin.name || admin.id)}</strong><small>${admin.protected ? 'Administrateur principal' : (isCurrentUser ? 'Administrateur actuel' : 'Administrateur')} · ${esc(admin.id)}</small></div></div><span>${action}</span></div>`;
  }).join('') || '<p class="empty">Aucun administrateur.</p>';
}
async function dashboard() {
  $('#modalTitle').textContent = 'Tableau de bord'; $('#modalContent').replaceChildren($('#dashboardTemplate').content.cloneNode(true));
  $('#welcome').textContent = me.user.name;
  const avatar = $('#dashboardAvatar');
  if (avatar) {
    avatar.src = me.user.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    avatar.alt = me.user.name;
  }
  fillCategorySelect();
  quill = new Quill('#richEditor', { theme: 'snow', placeholder: 'Rédigez votre article ici…', modules: { toolbar: [[{ header: [1, 2, 3, false] }], [{ font: [] }, { size: [] }], ['bold', 'italic', 'underline', 'strike'], [{ color: [] }, { background: [] }], [{ list: 'ordered' }, { list: 'bullet' }], [{ align: [] }], ['blockquote', 'code-block', 'link', 'image'], ['clean']] } });
  quill.getModule('toolbar').addHandler('image', () => uploadImage());
  document.querySelectorAll('[data-insert]').forEach(button => button.onclick = () => {
    const action = button.dataset.insert, range = quill.getSelection(true);
    if (action === 'image') return uploadImage();
    if (action === 'heading') { quill.formatLine(range.index, 1, 'header', 2); quill.focus(); return; }
    if (action === 'quote') { quill.formatLine(range.index, 1, 'blockquote', true); quill.focus(); return; }
    if (action === 'divider') { quill.insertText(range.index, '\n──────────\n', 'user'); quill.setSelection(range.index + 12); return; }
    quill.focus();
  });
  const articleList = $('#adminArticles'), categoryList = $('#adminCategories');
  const draw = () => { articleList.innerHTML = allArticles.map(a => `<div class="admin-row"><div><strong>${esc(a.title)}</strong><small>${esc(a.category)} · ${date(a.updatedAt || a.date)}</small></div><span><button data-edit-article="${a.id}">Modifier</button><button class="danger" data-delete-article="${a.id}">Supprimer</button></span></div>`).join('') || '<p class="empty">Aucun article.</p>'; categoryList.innerHTML = allCategories.map(c => `<div class="admin-row"><div><strong>${esc(c.name)}</strong><small>${esc(c.description)}</small></div><span><button data-edit-category="${c.id}">Modifier</button><button class="danger" data-delete-category="${c.id}">Supprimer</button></span></div>`).join(''); };
  draw(); await loadAdmins(); document.querySelectorAll('.tab').forEach(b => b.onclick = () => setPanel(b.dataset.panel)); document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => setPanel(b.dataset.open));
  $('#articleForm').onsubmit = async e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.target)), id = values.id; delete values.id; values.body = quill.root.innerHTML; if (quill.getText().trim().length === 0) return alert('Le contenu de l’article est obligatoire.'); const r = await fetch(id ? `/api/articles/${id}` : '/api/articles', { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(values) }); if (!r.ok) return alert((await r.json()).error); await load(); dashboard(); setPanel('articles'); };
  $('#cancelEdit').onclick = () => { $('#articleForm').reset(); $('#articleForm [name=id]').value = ''; quill.setText(''); $('#editorHeading').textContent = 'Nouvel article'; $('#cancelEdit').hidden = true; };
  $('#categoryForm').onsubmit = async e => { e.preventDefault(); const r = await fetch('/api/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}); if(!r.ok)return alert((await r.json()).error); await load(); dashboard(); setPanel('categories'); };
  $('#adminForm').onsubmit = async e => { e.preventDefault(); const id = e.target.elements.id.value.trim(); const r = await fetch('/api/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); if(!r.ok)return alert((await r.json()).error); e.target.reset(); await loadAdmins(); };
  $('#logout').onclick = async () => { await fetch('/api/logout',{method:'POST'}); await load(); showLogin(); };
  $('#modalContent').onclick = async e => { const articleId = e.target.dataset.editArticle || e.target.dataset.deleteArticle, categoryId = e.target.dataset.editCategory || e.target.dataset.deleteCategory, adminId = e.target.dataset.deleteAdmin; if (e.target.dataset.editArticle) { const a = allArticles.find(x=>x.id===articleId); Object.entries(a).forEach(([k,v]) => { const field = $(`#articleForm [name=${k}]`); if(field) field.value=v; }); quill.root.innerHTML = a.body; $('#editorHeading').textContent='Modifier l’article'; $('#cancelEdit').hidden=false; setPanel('write'); } if(e.target.dataset.deleteArticle && confirm('Supprimer définitivement cet article ?')) { await fetch(`/api/articles/${articleId}`,{method:'DELETE'}); await load(); dashboard(); } if(e.target.dataset.editCategory) { const c=allCategories.find(x=>x.id===categoryId), name=prompt('Nom de la catégorie :',c.name), description=name&&prompt('Description :',c.description); if(name&&description){const r=await fetch(`/api/categories/${categoryId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,name,description})});if(!r.ok)alert((await r.json()).error);await load();dashboard();setPanel('categories');} } if(e.target.dataset.deleteCategory && confirm('Supprimer cette catégorie ?')) { const r=await fetch(`/api/categories/${categoryId}`,{method:'DELETE'});if(!r.ok)alert((await r.json()).error);await load();dashboard();setPanel('categories'); } if(e.target.dataset.deleteAdmin) { const admin = allAdmins.find(x=>x.id===adminId); if (admin?.protected) { alert('Cet identifiant principal ne peut pas être retiré.'); return; } if(confirm('Retirer cet administrateur ?')) { const r=await fetch(`/api/admins/${adminId}`,{method:'DELETE'});if(!r.ok)alert((await r.json()).error);await loadAdmins(); } } };
}
async function uploadImage() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/gif,image/webp'; input.click(); input.onchange = async () => { const file = input.files[0]; if (!file) return; const data = new FormData(); data.append('image', file); const response = await fetch('/api/uploads', { method: 'POST', body: data }); if (!response.ok) return alert((await response.json()).error); const { url } = await response.json(), range = quill.getSelection(true); quill.insertEmbed(range.index, 'image', url, 'user'); quill.setSelection(range.index + 1); }; }
async function openStaff() { modal.showModal(); if (me?.user?.staff) await dashboard(); else if (me?.user) { $('#modalTitle').textContent = 'Accès refusé'; $('#modalContent').replaceChildren($('#deniedTemplate').content.cloneNode(true)); } else showLogin(); }
$('#staffButton').onclick = openStaff; $('.close').onclick = () => modal.close();
const argusLauncher = $('#argusLauncher');
const argusPanel = $('#argusPanel');
const argusMessages = $('#argusMessages');
const argusInput = $('#argusInput');
const argusSend = $('#argusSend');
const argusClose = $('#argusClose');
if (argusPanel) {
  argusPanel.hidden = true;
  argusPanel.style.display = 'none';
}
function addArgusMessage(text, fromBot = true) {
  if (!argusMessages) return;
  const message = document.createElement('div');
  message.className = `argus-message ${fromBot ? 'argus-message-bot' : 'argus-message-user'}`;
  message.innerHTML = `<p>${esc(text)}</p>`;
  argusMessages.appendChild(message);
  argusMessages.scrollTop = argusMessages.scrollHeight;
}
if (argusLauncher && argusPanel) {
  argusLauncher.addEventListener('click', () => {
    const isOpen = !argusPanel.hidden;
    argusPanel.hidden = isOpen;
    argusPanel.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) argusInput?.focus();
  });
}
if (argusClose && argusPanel) {
  argusClose.addEventListener('click', () => {
    argusPanel.hidden = true;
    argusPanel.style.display = 'none';
  });
}
if (argusSend) {
  argusSend.onclick = () => {
    const value = argusInput?.value?.trim();
    if (!value) return;
    addArgusMessage(value, false);
    if (argusInput) argusInput.value = '';
    addArgusMessage('ArgusV5 prépare une réponse...', true);
  };
}
if (argusInput) {
  argusInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault(); argusSend?.click();
    }
  });
}
const searchInput = $('#search');
if (searchInput) {
  searchInput.addEventListener('input', e => render(e.target.value));
}
document.querySelectorAll('[data-search]').forEach(b => b.onclick = () => { 
  if (searchInput) {
    searchInput.value = b.dataset.search; 
    render(b.dataset.search); 
  }
  const explorer = $('#explorer');
  if (explorer) explorer.scrollIntoView({ behavior: 'smooth' }); 
});
document.addEventListener('keydown', e => { 
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { 
    if (searchInput) {
      e.preventDefault(); 
      searchInput.focus(); 
    }
  } 
});
if (grid) {
  grid.onclick = e => { 
    const b = e.target.closest('.read'); 
    if (!b) return; 
    const a = allArticles.find(x => x.id === b.dataset.id); 
    location.href = `/${encodeURIComponent(a.slug)}`; 
  };
}
load();
