// 참여 작가 상세: data/artists.json에서 ?a=slug 작가를 찾아 그린다
(function () {
  var el = document.getElementById('artistBody');
  var slug = new URLSearchParams(location.search).get('a') || '';
  var esc = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  fetch('data/artists.json?v=1').then(function (r) { return r.json(); }).then(function (list) {
    var i = list.findIndex(function (x) { return x.slug === slug; });
    if (i < 0) { el.innerHTML = '<p class="lead">작가를 찾을 수 없습니다. <a href="artists.html" style="text-decoration:underline">참여 작가 목록</a>으로 돌아가 주세요.</p>'; return; }
    var a = list[i];
    document.title = a.name + ' — 참여 작가 | (사)한국청년문화예술인협회';
    document.getElementById('aName').textContent = a.name;
    document.getElementById('crumbName').textContent = a.name;
    document.getElementById('aMeta').textContent = a.meta;
    var h = '<div class="ap"><div class="ap-photo' + (a.portrait ? '' : ' noimg') + '">' +
      (a.portrait ? '<img src="' + esc(a.portrait) + '" alt="' + esc(a.name) + ' 작가 사진">' : esc(a.name.charAt(0))) + '</div><div>' +
      '<h2>' + esc(a.name) + (a.en ? '<small>' + esc(a.en) + '</small>' : '') + '</h2><p class="meta">' + esc(a.meta) + '</p>';
    if (a.bio && a.bio.length) {
      h += '<h3>약력</h3><ul class="bio">' + a.bio.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
      if (a.bioFrom) h += '<p class="src">' + esc(a.bioFrom) + '년 전시 도록 기준</p>';
    }
    h += '</div></div>';
    (a.shows || []).forEach(function (s) {
      h += '<div class="show"><div class="show-hd"><b>' + esc(s.year) + '</b><span>' + esc(s.exhibition) + '</span></div>';
      if (s.works && s.works.length) h += '<ul class="show-wk">' + s.works.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
      if (s.imgs && s.imgs.length) h += '<div class="show-gal">' + s.imgs.map(function (src) { return '<a href="' + esc(src) + '" target="_blank" rel="noopener"><img src="' + esc(src) + '" alt="' + esc(a.name) + ' 작품" loading="lazy"></a>'; }).join('') + '</div>';
      if (s.essay) h += '<div class="show-es"><h4>' + esc(s.essay.title) + '</h4>' + s.essay.text.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';
      h += '</div>';
    });
    var prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
    h += '<div class="ap-nav"><a href="artist.html?a=' + prev.slug + '">← ' + esc(prev.name) + '</a><a href="artists.html">작가 목록</a><a href="artist.html?a=' + next.slug + '">' + esc(next.name) + ' →</a></div>';
    el.innerHTML = h;
  }).catch(function () { el.innerHTML = '<p class="lead">작가 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>'; });
})();
