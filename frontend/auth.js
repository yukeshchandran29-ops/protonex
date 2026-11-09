
const menu = document.querySelector('.menu');
const nav = document.querySelector('.site-nav');
menu?.addEventListener('click',()=>{nav.classList.toggle('open');menu.setAttribute('aria-expanded',nav.classList.contains('open'))});

document.querySelectorAll('.password-toggle').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const input=document.getElementById(btn.dataset.target);
    const show=input.type==='password';
    input.type=show?'text':'password';
    btn.textContent=show?'Hide':'Show';
  });
});

const strengthBar=document.getElementById('strengthBar');
document.getElementById('signupPassword')?.addEventListener('input',e=>{
  const v=e.target.value;
  let score=0;
  if(v.length>=8) score++;
  if(/[A-Z]/.test(v)) score++;
  if(/[0-9]/.test(v)) score++;
  if(/[^A-Za-z0-9]/.test(v)) score++;
  strengthBar.style.width=(score*25)+'%';
});

const API_BASE = window.location.origin; // same-origin API in production; override for local dev if needed

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send/receive the HttpOnly session cookies
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Something went wrong. Please try again.');
  return json.data;
}

document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.classList.remove('show');
  if (!email || password.length < 6) { errorEl.textContent = 'Enter a valid email and password.'; errorEl.classList.add('show'); return; }

  const submitBtn = e.target.querySelector('.auth-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.label = submitBtn.textContent; submitBtn.textContent = 'Signing in…'; }
  try {
    await apiPost('/auth/login', { email, password });
    window.location.href = 'dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.label; }
  }
});

document.getElementById('signupForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('signupName')?.value.trim() || document.getElementById('signupEmail').value.split('@')[0];
  const email = document.getElementById('signupEmail').value.trim();
  const pass = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;
  const error = document.getElementById('signupError');
  error.classList.remove('show');
  if (pass.length < 8 || pass !== confirm) { error.textContent = 'Passwords must match and be at least 8 characters.'; error.classList.add('show'); return; }

  const submitBtn = e.target.querySelector('.auth-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.label = submitBtn.textContent; submitBtn.textContent = 'Creating account…'; }
  try {
    await apiPost('/auth/signup', { name, email, password: pass });
    window.location.href = 'dashboard.html';
  } catch (err) {
    error.textContent = err.message;
    error.classList.add('show');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.label; }
  }
});


(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');
  const progress = document.createElement('div');
  progress.className='scroll-progress';
  document.body.appendChild(progress);
  const update=()=>{
    const max=document.documentElement.scrollHeight-window.innerHeight;
    progress.style.width=`${max>0?(window.scrollY/max)*100:0}%`;
    header?.classList.toggle('scrolled',window.scrollY>12);
  };
  update();
  window.addEventListener('scroll',update,{passive:true});

  if(!reduceMotion){
    document.querySelectorAll('.auth-field input,.social-btn,.auth-submit').forEach(el=>{
      el.addEventListener('focus',()=>el.closest('.auth-field')?.classList.add('focused'));
      el.addEventListener('blur',()=>el.closest('.auth-field')?.classList.remove('focused'));
    });
  }
})();
