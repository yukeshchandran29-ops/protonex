
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const menu = $('.menu'), nav = $('.site-nav');
if(menu) menu.addEventListener('click',()=>{nav.classList.toggle('open'); menu.setAttribute('aria-expanded',nav.classList.contains('open'))});

const modal = $('#quoteModal');
const quoteType = $('#quoteType');
function openQuote(type){
  if(!modal) return;
  if(quoteType) quoteType.value = type;
  modal.classList.add('open');
  document.body.style.overflow='hidden';
  setTimeout(()=>$('#quoteName')?.focus(),50);
}
function closeQuote(){
  if(!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow='';
}
$$('[data-quote]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();openQuote(b.dataset.quote)}));
$('.close')?.addEventListener('click',closeQuote);
modal?.addEventListener('click',e=>{if(e.target===modal)closeQuote()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeQuote()});

const form = $('#quoteForm');
form?.addEventListener('submit',e=>{
  e.preventDefault();
  const fd = new FormData(form);
  const type = fd.get('type');
  const email = type==='Metal Cutting' ? 'cutting@foundryandfilament.example' : 'printing@foundryandfilament.example';
  const subject = `${type} quote — ${fd.get('name') || 'New request'}`;
  const body = [
    `Name: ${fd.get('name')||''}`,
    `Email: ${fd.get('email')||''}`,
    `Material: ${fd.get('material')||''}`,
    `Quantity: ${fd.get('quantity')||''}`,
    `Notes: ${fd.get('notes')||''}`,
    '',
    'File: please attach your CAD/CAD-export file to this email.'
  ].join('\n');
  location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

const file = $('#quoteFile'), drop = $('.drop');
file?.addEventListener('change',()=>{if(file.files[0]) drop.innerHTML=`<strong>${file.files[0].name}</strong><span>Ready to attach when your email opens.</span>`});
['dragenter','dragover'].forEach(ev=>drop?.addEventListener(ev,e=>{e.preventDefault();drop.style.borderColor='var(--accent)'}));
['dragleave','drop'].forEach(ev=>drop?.addEventListener(ev,e=>{e.preventDefault();drop.style.borderColor=''}));
drop?.addEventListener('drop',e=>{if(e.dataTransfer.files[0]){try{const dt=new DataTransfer();dt.items.add(e.dataTransfer.files[0]);file.files=dt.files}catch{};drop.innerHTML=`<strong>${e.dataTransfer.files[0].name}</strong><span>Ready to attach when your email opens.</span>`}});


/* =========================================================
   ProtoNex Premium Interaction Layer
   ========================================================= */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll progress + compact header
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  document.body.appendChild(progress);

  const updateScrollUI = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
    document.querySelector('.site-header')?.classList.toggle('scrolled', window.scrollY > 12);
  };
  updateScrollUI();
  window.addEventListener('scroll', updateScrollUI, {passive:true});

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {threshold:.12, rootMargin:'0px 0px -45px'});
    document.querySelectorAll('.reveal,.reveal-left,.reveal-scale,.stagger,.section h2').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('.reveal,.reveal-left,.reveal-scale,.stagger,.section h2').forEach(el => el.classList.add('is-visible'));
  }

  // Add reveal classes automatically to existing content.
  document.querySelectorAll('.choice-grid').forEach(el => el.classList.add('stagger'));
  document.querySelectorAll('.trust-grid,.card-grid,.steps,.specs,.materials').forEach(el => el.classList.add('stagger'));
  document.querySelectorAll('.section .label').forEach(el => el.classList.add('reveal-left'));
  document.querySelectorAll('.quote').forEach(el => el.classList.add('reveal-scale'));
  document.querySelectorAll('.page-hero > div:first-child').forEach(el => el.classList.add('reveal-left'));

  // Re-observe dynamically assigned classes.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {threshold:.12, rootMargin:'0px 0px -45px'});
    document.querySelectorAll('.reveal,.reveal-left,.reveal-scale,.stagger,.section h2').forEach(el => revealObserver.observe(el));
  } else {
    document.querySelectorAll('.reveal,.reveal-left,.reveal-scale,.stagger,.section h2').forEach(el => el.classList.add('is-visible'));
  }

  // Cursor spotlight on cards.
  document.querySelectorAll('.choice,.card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX-r.left}px`);
      card.style.setProperty('--my', `${e.clientY-r.top}px`);
    });
  });

  // Button ripple feedback.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn,.social-btn');
    if (!btn || reduceMotion) return;
    const r = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    Object.assign(ripple.style, {
      position:'absolute', left:`${e.clientX-r.left}px`, top:`${e.clientY-r.top}px`,
      width:'8px', height:'8px', borderRadius:'50%',
      background:'rgba(255,255,255,.28)', transform:'translate(-50%,-50%) scale(1)',
      pointerEvents:'none', transition:'transform .5s ease,opacity .5s ease', opacity:'1'
    });
    btn.appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform='translate(-50%,-50%) scale(22)';
      ripple.style.opacity='0';
    });
    setTimeout(() => ripple.remove(), 520);
  });

  // Smooth anchor navigation.
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block:'start'});
      document.querySelector('.site-nav')?.classList.remove('open');
    });
  });
})();
