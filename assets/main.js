(function(){
  var b=document.body, burger=document.getElementById('burger');
  if(burger){burger.addEventListener('click',function(){
    var open=b.classList.toggle('m-open');burger.setAttribute('aria-expanded',open)});}
  document.querySelectorAll('.mnav a').forEach(function(a){a.addEventListener('click',function(){b.classList.remove('m-open')})});

  var els=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.1,rootMargin:'0px 0px -40px 0px'});
    els.forEach(function(e){io.observe(e)});
  } else els.forEach(function(e){e.classList.add('in')});

  document.querySelectorAll('[data-copy]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var t=btn.getAttribute('data-copy'),o=btn.textContent;
      function done(){btn.textContent='복사됨';setTimeout(function(){btn.textContent=o},1600)}
      if(navigator.clipboard){navigator.clipboard.writeText(t).then(done,function(){})}
    });
  });

  var f=document.querySelector('.filter');
  if(f){f.addEventListener('click',function(e){
    var k=e.target.getAttribute('data-f');if(!k)return;
    f.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===e.target)});
    document.querySelectorAll('[data-cat]').forEach(function(c){
      c.style.display=(k==='all'||c.getAttribute('data-cat').indexOf(k)>-1)?'':'none'});
  });}
})();
(function(){
  var imgs=document.querySelectorAll('.gal img, .works img');if(!imgs.length)return;
  var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<img alt="">';document.body.appendChild(lb);
  imgs.forEach(function(i){i.addEventListener('click',function(){lb.querySelector('img').src=i.getAttribute('data-full')||i.src;lb.classList.add('on')})});
  lb.addEventListener('click',function(){lb.classList.remove('on')});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('on')});
})();
(function(){
  var f=document.querySelector('.filter'),c=document.querySelector('.count b');if(!f||!c)return;
  f.addEventListener('click',function(){setTimeout(function(){c.textContent=[].filter.call(document.querySelectorAll('[data-cat]'),function(x){return x.style.display!=='none'}).length},0)});
})();
