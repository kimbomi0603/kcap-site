// 회원 가입 신청서: 입력 확인 → 사진 용량 줄이기 → FormSubmit으로 담당자 메일 발송
(function () {
  var f = document.getElementById('joinForm');
  if (!f) return;
  var done = document.getElementById('jfDone'), err = document.getElementById('jfErr');
  var send = f.querySelector('.jf-send'), label = send && send.firstChild.nodeValue;

  // 제출 후 돌아온 경우: 접수 안내만 보여 준다
  if (/[?&]sent=1/.test(location.search)) {
    done.hidden = false; f.hidden = true;
    setTimeout(function () { done.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    return;
  }
  // 미리보기 · 운영 주소 어디서든 같은 사이트로 돌아오도록
  f.querySelector('[name=_next]').value = location.origin + '/join.html?sent=1#member';

  function fail(msg, el) {
    err.textContent = msg; err.hidden = false;
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return false;
  }
  function val(name) { var el = f.elements[name]; return el ? (el.value || '').trim() : ''; }
  function fields() {
    return [].map.call(f.querySelectorAll('[data-group="fields"] input:checked'), function (i) { return i.value; });
  }

  // 사진이 크면(1.5MB 초과) 긴 변 1600px JPEG로 줄여 다시 넣는다. 메일 첨부 한도(5MB) 대비.
  var photo = f.elements['회원사진'], note = document.getElementById('jfPhotoNote');
  var MAX = 1.5 * 1024 * 1024;
  photo.addEventListener('change', function () {
    var file = photo.files && photo.files[0];
    if (!file || file.size <= MAX || !/^image\//.test(file.type) || !window.DataTransfer) return;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var r = Math.min(1, 1600 / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) {
        if (!b) return;
        var dt = new DataTransfer();
        dt.items.add(new File([b], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        photo.files = dt.files;
        if (note) note.textContent = '사진을 보내기 좋은 크기로 줄였습니다 (' + Math.round(b.size / 1024) + 'KB)';
      }, 'image/jpeg', 0.86);
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
  });

  f.addEventListener('submit', function (e) {
    err.hidden = true;
    var ok = (function () {
      if (!f.querySelector('[name="회원구분"]:checked')) return fail('회원 구분을 선택해 주세요.', f.querySelector('[name="회원구분"]'));
      if (!val('성명')) return fail('성명을 적어 주세요.', f.elements['성명']);
      if (!val('생년월일')) return fail('생년월일을 적어 주세요.', f.elements['생년월일']);
      var tel = val('휴대전화').replace(/\D/g, '');
      if (tel.length < 9 || tel.length > 11) return fail('휴대전화 번호를 확인해 주세요.', f.elements['휴대전화']);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email'))) return fail('이메일 주소를 확인해 주세요.', f.elements['email']);
      if (!val('거주 시도')) return fail('거주 시·도를 선택해 주세요.', f.elements['거주 시도']);
      if (!photo.files || !photo.files.length) return fail('회원 사진을 첨부해 주세요.', photo);
      if (photo.files[0].size > 5 * 1024 * 1024) return fail('사진이 5MB를 넘습니다. 더 작은 사진을 골라 주세요.', photo);
      var fs = fields();
      if (!fs.length) return fail('활동 분야를 하나 이상 골라 주세요.', f.querySelector('[data-group="fields"] input'));
      var link = val('포트폴리오 링크');
      if (link && !/^https?:\/\//i.test(link)) f.elements['포트폴리오 링크'].value = 'https://' + link;
      if (!f.elements['정관 준수'].checked) return fail('정관 준수에 동의해 주세요.', f.elements['정관 준수']);
      if (!f.elements['개인정보 수집이용'].checked) return fail('개인정보 수집 · 이용에 동의해 주세요.', f.elements['개인정보 수집이용']);
      document.getElementById('jfFields').value = fs.join(', ');
      f.querySelector('[name=_subject]').value = '[회원가입 신청] ' + val('성명') + ' · ' + f.querySelector('[name="회원구분"]:checked').value;
      return true;
    })();
    if (!ok) { e.preventDefault(); return; }
    send.disabled = true; send.firstChild.nodeValue = '보내는 중… ';
  });
  // 보낸 뒤 '뒤로'로 돌아오면 잠긴 버튼을 다시 켠다
  window.addEventListener('pageshow', function () {
    if (send && send.disabled) { send.disabled = false; send.firstChild.nodeValue = label; }
  });
})();
