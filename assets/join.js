(function () {
  var f = document.getElementById('joinForm');
  if (!f) return;
  var done = document.getElementById('jfDone'), err = document.getElementById('jfErr');

  // 제출 후 돌아온 경우: 접수 안내만 보여 준다
  if (/[?&]sent=1/.test(location.search)) {
    done.hidden = false; f.hidden = true;
    setTimeout(function () { done.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    return;
  }
  // 미리보기 · 운영 주소 어디서든 같은 사이트로 돌아오도록
  f.querySelector('[name=_next]').value = location.origin + '/join.html?sent=1#member';

  function vals(group) {
    return [].map.call(f.querySelectorAll('[data-group="' + group + '"] input:checked'), function (i) { return i.value; });
  }
  function fail(msg, el) {
    err.textContent = msg; err.hidden = false;
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return false;
  }
  function val(name) { var el = f.elements[name]; return el ? (el.value || '').trim() : ''; }

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
      var fields = vals('fields');
      if (!fields.length) return fail('활동 분야를 하나 이상 골라 주세요.', f.querySelector('[data-group="fields"] input'));
      var photo = f.elements['회원사진'];
      if (!photo.files || !photo.files.length) return fail('회원 사진을 첨부해 주세요.', photo);
      var total = 0;
      [].forEach.call(f.querySelectorAll('input[type=file]'), function (i) { [].forEach.call(i.files || [], function (x) { total += x.size; }); });
      if (total > 10 * 1024 * 1024) return fail('첨부 파일이 10MB를 넘습니다. 사진이나 포트폴리오 용량을 줄여 주세요.', photo);
      var link = val('포트폴리오 링크');
      if (link && !/^https?:\/\//i.test(link)) f.elements['포트폴리오 링크'].value = 'https://' + link;
      if (!f.elements['정관 준수'].checked) return fail('정관 준수에 동의해 주세요.', f.elements['정관 준수']);
      if (!f.elements['개인정보 수집이용'].checked) return fail('개인정보 수집 · 이용에 동의해 주세요.', f.elements['개인정보 수집이용']);
      document.getElementById('jfFields').value = fields.join(', ');
      document.getElementById('jfWants').value = vals('wants').join(', ');
      f.querySelector('[name=_subject]').value = '[회원가입 신청] ' + val('성명') + ' · ' + f.querySelector('[name="회원구분"]:checked').value;
      return true;
    })();
    if (!ok) { e.preventDefault(); return; }
    var b = f.querySelector('.jf-send'); b.disabled = true; b.firstChild.nodeValue = '보내는 중… ';
  });
})();
