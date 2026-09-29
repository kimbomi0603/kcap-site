/* 알림 구독 — scripts/snippets/subscribe-form.html 폼을 /api/subscribe 에 보낸다.
   '나에게 맞는 공모' 조건(localStorage kcap_profile_v1: {who, age, tag, reg})이 있으면 미리 채운다. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var form = $('#subf');
  if (!form) return;
  var F = { email: $('#sbEmail'), who: $('#sbWho'), age: $('#sbAge'), tag: $('#sbTag'), reg: $('#sbReg') };
  var btn = $('#sbBtn'), out = $('#sbOut');

  // 저장된 조건으로 미리 채우기 (이 브라우저에만 있는 값)
  try {
    var pf = JSON.parse(localStorage.getItem('kcap_profile_v1') || '{}');
    if (pf.who && F.who) F.who.value = pf.who;
    if (pf.age && F.age) F.age.value = pf.age;
    if (pf.tag && F.tag) F.tag.value = pf.tag;
    if (pf.reg && F.reg) F.reg.value = pf.reg;
  } catch (e) {}

  var MSG = {
    ok: '확인 메일을 보냈습니다. 메일의 링크를 누르면 구독이 시작됩니다.',
    notReady: '알림 서비스를 준비하고 있습니다. 준비되면 이 자리에서 바로 신청할 수 있습니다.',
    email: '이메일 주소를 확인해 주세요.',
    fail: '신청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
  };
  function show(cls, text) { out.className = 'subf-out ' + cls; out.textContent = text; }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = (F.email.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { show('err', MSG.email); F.email.focus(); return; }
    var ageN = parseInt(F.age.value, 10);
    var body = {
      email: email,
      who: F.who.value || '',
      age: isNaN(ageN) ? null : ageN,
      tags: F.tag.value && F.tag.value !== '전체' ? [F.tag.value] : [],
      reg: F.reg.value || 'all'
    };
    btn.disabled = true; show('wait', '보내는 중…');
    fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (x) {
        var j = x.j || {};
        if (j.ok) { show('ok', MSG.ok); F.email.value = ''; return; }
        if (j.configured === false) { show('wait', MSG.notReady); return; }
        show('err', j.error || MSG.fail);
      })
      .catch(function () { show('err', MSG.fail); })
      .then(function () { btn.disabled = false; });
  });
})();
