(function(){
  var b=document.body, burger=document.getElementById('burger');
  function setMenu(open){b.classList.toggle('m-open',open);if(burger)burger.setAttribute('aria-expanded',open)}
  if(burger){burger.addEventListener('click',function(){setMenu(!b.classList.contains('m-open'))});}
  document.querySelectorAll('.mnav a').forEach(function(a){a.addEventListener('click',function(){setMenu(false)})});
  // 모바일 메뉴는 Esc 로도 닫는다
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&b.classList.contains('m-open')){setMenu(false);if(burger)burger.focus()}});

  var els=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.1,rootMargin:'0px 0px -40px 0px'});
    els.forEach(function(e){io.observe(e)});
  } else els.forEach(function(e){e.classList.add('in')});

  // 복사 버튼. 클립보드를 못 쓰는 브라우저(일부 앱 안 브라우저)에서는 직접 복사할 수 있게 창을 띄운다
  document.querySelectorAll('[data-copy]').forEach(function(btn){
    var o=btn.textContent;
    btn.addEventListener('click',function(){
      var t=btn.getAttribute('data-copy');
      function done(){btn.textContent='복사됨';setTimeout(function(){btn.textContent=o},1600)}
      function manual(){window.prompt('아래 내용을 길게 눌러 복사하세요',t)}
      if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(done,manual)}else manual();
    });
  });

  // 언론보도 분류: 고른 분류의 기사만 보이고, 기사가 없는 연도는 숨기며 연도별 건수도 맞춘다
  var f=document.querySelector('.filter');
  if(f){
    var fb=f.querySelectorAll('button[data-f]');
    fb.forEach(function(x){x.type='button';x.setAttribute('aria-pressed',x.classList.contains('on')?'true':'false')});
    f.addEventListener('click',function(e){
      var btn=e.target.closest('button[data-f]');if(!btn)return;
      var k=btn.getAttribute('data-f');
      fb.forEach(function(x){var on=x===btn;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false')});
      var shown=0;
      document.querySelectorAll('[data-cat]').forEach(function(c){
        var ok=k==='all'||c.getAttribute('data-cat').split(' ').indexOf(k)>-1;
        c.style.display=ok?'':'none';if(ok)shown++;
      });
      document.querySelectorAll('.ptl-y').forEach(function(y){
        var n=[].filter.call(y.querySelectorAll('[data-cat]'),function(c){return c.style.display!=='none'}).length;
        y.style.display=n?'':'none';
        var s=y.querySelector('.d small');if(s)s.textContent=n+'건';
      });
      var c=document.querySelector('.count b');if(c)c.textContent=shown;
    });
  }
})();
(function(){
  // 작품 · 활동 사진 크게 보기 (마우스 · 터치 · 키보드)
  var imgs=document.querySelectorAll('.gal img, .works img');if(!imgs.length)return;
  var lb=document.createElement('div');lb.className='lb';
  lb.setAttribute('role','dialog');lb.setAttribute('aria-modal','true');lb.setAttribute('aria-label','사진 크게 보기');
  lb.innerHTML='<img alt=""><button type="button" class="lb-x" aria-label="닫기">×</button>';
  document.body.appendChild(lb);
  var big=lb.querySelector('img'),x=lb.querySelector('.lb-x'),last=null;
  function open(i){last=i;big.src=i.getAttribute('data-full')||i.currentSrc||i.src;big.alt=i.alt||'';lb.classList.add('on');x.focus()}
  function close(){if(!lb.classList.contains('on'))return;lb.classList.remove('on');if(last)last.focus()}
  imgs.forEach(function(i){
    i.setAttribute('tabindex','0');i.setAttribute('role','button');
    i.setAttribute('aria-label',(i.alt?i.alt+' — ':'')+'크게 보기');
    i.addEventListener('click',function(){open(i)});
    i.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(i)}});
  });
  lb.addEventListener('click',close);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
})();
