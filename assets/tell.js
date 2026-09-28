(function () {
  var f = document.getElementById('tellForm'); if (!f) return;
  var done = document.getElementById('tellDone');
  if (/[?&]sent=1/.test(location.search)) { done.hidden = false; f.hidden = true; return; }
  f.querySelector('[name=_next]').value = location.origin + '/calendar.html?sent=1#tell';
  f.addEventListener('submit', function (e) {
    var s = f.elements['시작일'].value, t = f.elements['종료일'].value, size = 0;
    [].forEach.call(f.querySelectorAll('input[type=file]'), function (i) { [].forEach.call(i.files || [], function (x) { size += x.size; }); });
    var msg = !f.checkValidity() ? '빠진 항목을 채워 주세요.' : (t < s ? '종료일이 시작일보다 빠릅니다.' : (size > 10485760 ? '포스터 이미지는 10MB까지 보낼 수 있습니다.' : ''));
    if (msg) { e.preventDefault(); f.reportValidity(); if (window.KCAP) KCAP.toast(msg); else alert(msg); return; }
    f.querySelector('[name=_subject]').value = '[전시 알리기] ' + f.elements['전시명'].value;
  });
})();
