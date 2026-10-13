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

  // 작품 사진: 여러 장을 고르면 한 장씩 줄여서 '작품사진1~5' 이름의 숨은 첨부칸에 나눠 담는다
  // (FormSubmit은 첨부칸마다 파일 하나를 받는 방식이 가장 확실하다)
  var works = document.getElementById('jfWorks'), worksBox = document.getElementById('jfWorksBox'), worksNote = document.getElementById('jfWorksNote');
  var book = document.getElementById('jfBook'), bookNote = document.getElementById('jfBookNote');
  var TOTAL = 9 * 1024 * 1024, WMAX = 5, pending = 0;
  function shrink(file, cb) {
    if (!/^image\//.test(file.type) || file.size <= 700 * 1024) return cb(file);
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var r = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function (b) { cb(b ? new File([b], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.85);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(file); };
    img.src = url;
  }
  if (works && window.DataTransfer) works.addEventListener('change', function () {
    worksBox.innerHTML = '';
    var list = [].slice.call(works.files || []).filter(function (x) { return /^image\//.test(x.type); });
    if (list.length > WMAX) { list = list.slice(0, WMAX); worksNote.textContent = '작품 사진은 5장까지 보낼 수 있어 앞의 5장만 담았습니다.'; }
    pending = list.length;
    if (!pending) return;
    worksNote.textContent = '사진을 준비하는 중입니다…';
    var done = [];
    list.forEach(function (file, i) {
      shrink(file, function (out) {
        done[i] = out;
        if (--pending) return;
        done.forEach(function (x, k) {
          var inp = document.createElement('input'); inp.type = 'file'; inp.name = '작품사진' + (k + 1); inp.hidden = true;
          var dt = new DataTransfer(); dt.items.add(x); inp.files = dt.files; worksBox.appendChild(inp);
        });
        var kb = done.reduce(function (s, x) { return s + x.size; }, 0) / 1024;
        worksNote.textContent = '작품 사진 ' + done.length + '장을 담았습니다 (' + (kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : Math.round(kb) + 'KB') + ').';
      });
    });
  });
  function totalSize() {
    var s = 0; [].forEach.call(f.querySelectorAll('input[type=file][name]'), function (i) { [].forEach.call(i.files || [], function (x) { s += x.size; }); });
    return s;
  }
  if (book) book.addEventListener('change', function () {
    var x = book.files && book.files[0]; if (!x) return;
    bookNote.textContent = x.name + ' (' + (x.size / 1048576).toFixed(1) + 'MB)' + (totalSize() > TOTAL ? ' — 첨부 합계가 9MB를 넘습니다. 파일을 줄이거나 링크로 보내 주세요.' : '');
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
      if (pending) return fail('작품 사진을 준비하는 중입니다. 잠시 뒤 다시 눌러 주세요.', works);
      if (totalSize() > TOTAL) return fail('첨부 파일이 모두 합쳐 9MB를 넘습니다. 도록은 링크로 보내거나 사진 수를 줄여 주세요.', book);
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
