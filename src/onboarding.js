// First-run flow: sign in (cloud), then create a jar or join one with an invite code.
import { html, useState } from './ui.js';
import { Icon } from './icons.js';
import { Jar, closeSheet } from './components.js';
import { Scene, Sprite } from './sprites.js';
import { CurrencyPicker } from './add.js';
import { MODE, createCouple, joinCouple, sendCode, verifyCode, useStore, signOut, friendlyError } from './store.js';
import { currencyName, symbolFor } from './money.js';

// Names used when the couple leaves the name fields blank.
const DEFAULT_ME = 'Darren';
const DEFAULT_PARTNER = 'Ji Won';
// Names are proper nouns: no autocorrect or spellcheck squiggles.
const NAME_INPUT = { autocorrect: 'off', autocapitalize: 'words', spellcheck: false };

function regionCurrency() {
  const map = { SG: 'SGD', MY: 'MYR', US: 'USD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', JP: 'JPY', HK: 'HKD', CA: 'CAD', ID: 'IDR', TH: 'THB', PH: 'PHP', IN: 'INR', KR: 'KRW', TW: 'TWD', CN: 'CNY' };
  const region = (navigator.language || 'en-SG').split('-')[1]?.toUpperCase();
  return map[region] ?? 'SGD';
}

function Hero({ title, sub }) {
  return html`
    <div class="welcome-hero">
      <div class="welcome-scene"><${Scene} compact>
        <div class="party-stage">
          <${Sprite} look="a" mood="happy"/>
          <${Jar} left=${0.7} summary="Two little characters beside a honey jar"/>
          <${Sprite} look="b" mood="happy" delay=${400}/>
        </div>
      <//></div>
      <h1 class="logo">${title}</h1>
      <p>${sub}</p>
    </div>`;
}

function Field({ label, children, hint }) {
  return html`<label class="form-field"><span>${label}</span>${children}${hint && html`<small>${hint}</small>`}</label>`;
}

export function Onboarding() {
  const s = useStore();
  const signedIn = MODE === 'demo' || !!s.session;
  const [step, setStep] = useState(signedIn ? 'choose' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [myName, setMyName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [currency, setCurrency] = useState(regionCurrency());
  const [budget, setBudget] = useState('1000');
  const [sample, setSample] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn, next) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (next) setStep(next);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  // Cloud sign-in finished while on the email/code step → move on.
  if (MODE === 'cloud' && s.session && (step === 'email' || step === 'code')) setTimeout(() => setStep('choose'), 0);

  const body = {
    email: html`
      <${Hero} title="Date Jar" sub="A shared date budget for couples."/>
      <form class="form" onSubmit=${(e) => { e.preventDefault(); run(() => sendCode(email.trim()), 'code'); }}>
        <${Field} label="Your email" hint="We email you a sign-in code. No password needed.">
          <input type="email" required autocomplete="email" inputmode="email" autocapitalize="off" placeholder="you@example.com" value=${email} onInput=${(e) => setEmail(e.target.value)}/>
        <//>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn btn-primary btn-block" disabled=${busy || !email.includes('@')}>${busy ? 'Sending…' : 'Send me a code'}</button>
      </form>`,

    code: html`
      <button class="back" onClick=${() => { setStep('email'); setError(''); }}><${Icon} name="back" size=${20}/> Back</button>
      <div class="step-head"><h1>Check your email</h1><p>We sent a code to <b>${email}</b>.</p></div>
      <form class="form" onSubmit=${(e) => { e.preventDefault(); run(() => verifyCode(email.trim(), code.trim())); }}>
        <${Field} label="Sign-in code">
          <input class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456" value=${code} onInput=${(e) => setCode(e.target.value.replace(/\D/g, ''))}/>
        <//>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn btn-primary btn-block" disabled=${busy || code.length < 6}>${busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" class="link" onClick=${() => run(() => sendCode(email.trim()))}>Send a new code</button>
      </form>`,

    choose: html`
      <${Hero} title=${MODE === 'demo' ? 'Welcome to Date Jar' : 'Nice to meet you'} sub="A shared budget for your dates. Add what you spend. See what is left. Pay each other back each month."/>
      <div class="btn-col">
        <button class="btn btn-primary btn-block" onClick=${() => { setError(''); setStep('create'); }}>Start our jar</button>
        ${MODE === 'cloud' && html`<button class="btn btn-secondary btn-block" onClick=${() => { setError(''); setStep('join'); }}>I have an invite code</button>`}
        ${MODE === 'cloud' && html`<button class="link" onClick=${() => { signOut(); setStep('email'); }}>Use a different email</button>`}
      </div>
      ${MODE === 'demo' && html`<p class="hint center">Demo mode: your data stays on this phone only. Sharing with your partner comes later.</p>`}`,

    create: html`
      <button class="back" onClick=${() => setStep('choose')}><${Icon} name="back" size=${20}/> Back</button>
      <div class="step-head"><h1>Set up your jar</h1><p>Add your names and your monthly date budget. You can change this later.</p></div>
      <form class="form" onSubmit=${(e) => {
        e.preventDefault();
        run(async () => {
          await createCouple({ myName: myName.trim() || DEFAULT_ME, partnerName: partnerName.trim() || DEFAULT_PARTNER, currency, budget: Number(budget) || 1000, sample });
        });
      }}>
        <${Field} label="Your name"><input autocomplete="given-name" ...${NAME_INPUT} value=${myName} onInput=${(e) => setMyName(e.target.value)} maxlength="40" placeholder=${DEFAULT_ME}/><//>
        ${MODE === 'demo' && html`<${Field} label="Your partner's name"><input autocomplete="off" ...${NAME_INPUT} value=${partnerName} onInput=${(e) => setPartnerName(e.target.value)} maxlength="40" placeholder=${DEFAULT_PARTNER}/><//>`}
        <div class="two-col">
          <${Field} label="Home currency">
            <button type="button" class="select-btn" onClick=${() => setPicker(true)}><b>${currency}</b> <span>${currencyName(currency)}</span><${Icon} name="down" size=${16}/></button>
          <//>
          <${Field} label="Monthly budget">
            <span class="inline-input big"><i>${symbolFor(currency).trim()}</i><input inputmode="decimal" value=${budget} onInput=${(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}/></span>
          <//>
        </div>
        ${MODE === 'demo' && html`
          <label class="check"><input type="checkbox" checked=${sample} onChange=${(e) => setSample(e.target.checked)}/><span>Add sample expenses to try the app<small>They are marked “sample”. Erase them in Settings.</small></span></label>`}
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn btn-primary btn-block" disabled=${busy}>${busy ? 'Creating…' : 'Create our jar'}</button>
      </form>
      ${picker && html`<${CurrencyPicker} value=${currency} home=${currency} onPick=${(c) => { setCurrency(c); setPicker(false); }} onClose=${() => closeSheet(() => setPicker(false))}/>`}`,

    join: html`
      <button class="back" onClick=${() => setStep('choose')}><${Icon} name="back" size=${20}/> Back</button>
      <div class="step-head"><h1>Join your partner's jar</h1><p>Ask your partner for the invite code. They find it in Settings.</p></div>
      <form class="form" onSubmit=${(e) => { e.preventDefault(); run(() => joinCouple({ code: joinCode, myName: myName.trim() || DEFAULT_PARTNER })); }}>
        <${Field} label="Invite code"><input class="code-input" autocapitalize="characters" autocomplete="off" maxlength="6" placeholder="ABC123" value=${joinCode} onInput=${(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/><//>
        <${Field} label="Your name"><input autocomplete="given-name" ...${NAME_INPUT} value=${myName} onInput=${(e) => setMyName(e.target.value)} maxlength="40" placeholder=${DEFAULT_PARTNER}/><//>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn btn-primary btn-block" disabled=${busy || joinCode.length < 6}>${busy ? 'Joining…' : 'Join the jar'}</button>
      </form>`,
  }[step];

  return html`<main class="onboarding">${body}</main>`;
}

const friendly = friendlyError;
