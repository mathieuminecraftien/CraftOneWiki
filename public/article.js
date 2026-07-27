const root = document.querySelector('#articlePage');
const esc = value => String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[ch]);
const formatDate = value => new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long', year:'numeric' }).format(new Date(value));
const slug = decodeURIComponent(location.pathname.slice(1));

fetch(`/api/articles/slug/${encodeURIComponent(slug)}`)
  .then(async response => { if (!response.ok) throw Error(); return response.json(); })
  .then(article => {
    document.title = `${article.title} — CraftOneWiki`;
    root.innerHTML = `<article class="article-page"><a href="/?category=${encodeURIComponent(article.category)}" class="tag ${esc(article.category)}">${esc(article.category)}</a><h1>${esc(article.title)}</h1><p class="article-lead">${esc(article.excerpt)}</p><div class="article-meta">Par ${esc(article.author)} · Mis à jour le ${formatDate(article.updatedAt || article.date)}</div><div class="article-body">${article.body}</div></article>`;
  })
  .catch(() => {
    document.title = 'Article introuvable — CraftOneWiki';
    root.innerHTML = '<section class="not-found"><p class="eyebrow">ERREUR 404</p><h1>Cet article est introuvable.</h1><a href="/">Retourner au wiki →</a></section>';
  });
