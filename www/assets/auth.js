(function () {
  const CONFIG = window.BrettConfig || {};

  (function injectAuthCss(){
    if (document.getElementById('brett-auth-css')) return;
    const st = document.createElement('style'); st.id = 'brett-auth-css';
    st.textContent = `
      .auth-slot,.donate-slot{display:inline-flex}
      .account-button,.donate-button{border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)));border-radius:999px;padding:10px 13px;background:var(--panel,rgba(255,255,255,.08));color:var(--text,var(--ink,#f8fafc));font:800 13px/1 system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .account-button:hover,.donate-button:hover{filter:brightness(1.08)}
      .auth-backdrop,.donate-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.58);backdrop-filter:blur(10px)}
      .auth-modal,.donate-modal{width:min(620px,100%);max-height:min(92vh,780px);overflow:auto;border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)));border-radius:26px;background:var(--panel-strong,var(--paper,#111827));color:var(--text,var(--ink,#f8fafc));box-shadow:0 34px 110px rgba(0,0,0,.48);padding:24px;position:relative}
      .auth-modal h2,.donate-modal h2{margin:0 0 8px;font-size:clamp(26px,4vw,40px);letter-spacing:-.04em}.auth-modal p,.donate-modal p{color:var(--muted,#9ca3af);line-height:1.5}
      .auth-sub{margin:0 38px 18px 0!important}.auth-modal label{display:block;margin:12px 0 7px;color:var(--muted,#9ca3af);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}
      .auth-modal input{width:100%;border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)));border-radius:14px;padding:12px;background:var(--paper-2,rgba(255,255,255,.08));color:var(--text,var(--ink,#f8fafc));font:inherit}
      .auth-modal button,.donate-modal button{border:0;border-radius:999px;padding:11px 15px;font-weight:900;cursor:pointer;background:var(--accent,#f59e0b);color:#111827}.auth-modal button[disabled]{opacity:.55;cursor:not-allowed}
      .auth-x,.donate-x{position:absolute;right:14px;top:14px;width:34px;height:34px;padding:0!important;background:var(--paper-2,rgba(255,255,255,.08))!important;color:var(--text,var(--ink,#f8fafc))!important}
      .auth-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}.auth-link{margin-top:12px;background:transparent!important;color:var(--accent,#f59e0b)!important;padding:6px 0!important}
      .auth-ghost{background:var(--paper-2,rgba(255,255,255,.08))!important;color:var(--text,var(--ink,#f8fafc))!important;border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)))!important}
      .auth-error{min-height:20px;color:#ff6b6b!important;font-weight:800}.donate-muted{font-size:13px}.game-top-actions .account-button,.game-top-actions .donate-button{padding:9px 11px}
      .auth-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.auth-tabs button{background:var(--paper-2,rgba(255,255,255,.08))!important;color:var(--text,var(--ink,#f8fafc))!important;border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)))!important;padding:9px 12px}.auth-tabs button[aria-selected="true"]{background:var(--accent,#f59e0b)!important;color:#111827!important;border-color:transparent!important}
      .auth-section{display:none}.auth-section.active{display:block}.auth-card{border:1px solid var(--line,var(--hairline,rgba(255,255,255,.14)));border-radius:18px;background:var(--paper-2,rgba(255,255,255,.06));padding:16px;margin:12px 0}.auth-list{display:grid;gap:10px;margin-top:10px}.auth-item{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-top:1px solid var(--line,var(--hairline,rgba(255,255,255,.10)));padding-top:10px}.auth-item:first-child{border-top:0;padding-top:0}.auth-item strong{display:block}.auth-item small,.auth-muted{color:var(--muted,#9ca3af);font-size:13px}.auth-form-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.auth-badge{display:inline-flex;border-radius:999px;padding:4px 9px;background:var(--accent,#f59e0b);color:#111827;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.auth-empty{color:var(--muted,#9ca3af);font-style:italic}.auth-link-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}.auth-link-row+.auth-link-row{border-top:1px solid var(--line,rgba(255,255,255,.10))}.auth-link-row b{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:8px;border-radius:999px;background:var(--paper,rgba(255,255,255,.12));font-size:12px}.auth-link-row button{padding:8px 13px;font-size:13px}.auth-note{margin:10px 0 0!important;font-size:12px;line-height:1.45}.auth-warning{border-left:4px solid var(--accent,#f59e0b);padding:10px 12px;background:var(--paper-2,rgba(255,255,255,.07));border-radius:12px}.auth-danger{background:rgba(239,68,68,.16)!important;color:#fecaca!important;border:1px solid rgba(239,68,68,.34)!important}
      .auth-oauth{display:grid;gap:10px;margin:14px 0 16px}.auth-oauth-title{display:flex;align-items:center;gap:10px;color:var(--muted,#9ca3af);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.auth-oauth-title:before,.auth-oauth-title:after{content:"";height:1px;background:var(--line,var(--hairline,rgba(255,255,255,.16)));flex:1}.auth-oauth button{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:var(--paper-2,rgba(255,255,255,.08))!important;color:var(--text,var(--ink,#f8fafc))!important;border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)))!important}.auth-oauth button b{font-size:17px}.auth-provider-note{margin-top:12px!important;font-size:13px!important}.auth-support{font-size:13px!important;margin:10px 0 0!important}.auth-support a{color:var(--accent,#f59e0b);font-weight:900}
    `;
    document.head.appendChild(st);
  })();

  const i18n = window.BFI18N;
  const L = {
    de:{profile:'Profil',login:'Profil',account:'Profil',logout:'Abmelden',name:'Benutzername',display:'Anzeigename',password:'Passwort',signin:'Einloggen',register:'Registrieren',save:'Speichern',cancel:'Abbrechen',create:'Account erstellen',have:'Schon Account? Einloggen',need:'Noch kein Account? Registrieren',logged:'Angemeldet als',optionalTitle:'Optionales Profil',optionalText:'Du brauchst keinen Login zum Spielen. Der Account ist nur für Errungenschaften, Freundesliste und später vielleicht ein Regal voller fragwürdiger Ruhmestaten.',tabProfile:'Profil',tabAch:'Errungenschaften',tabFriends:'Freunde',achTitle:'Errungenschaften',achEmpty:'Noch keine Errungenschaften. Die Würfel führen erst Buch, wenn du eingeloggt bist.',friendsTitle:'Freundesliste',friendsEmpty:'Noch keine Freunde. Trag einen Benutzernamen ein und tu so, als wäre das sozial.',friendName:'Benutzername',addFriend:'Freund hinzufügen',searchFriend:'Freunde suchen',searchFriendPh:'Name eingeben…',noResults:'Keine Treffer.',friendMark:'Freund ✓',remove:'Entfernen',invalid:'Login fehlgeschlagen. Name oder Passwort falsch.',short:'Passwort braucht mindestens 8 Zeichen.',exists:'Der Name ist schon vergeben.',disabled:'Registrierung ist aktuell deaktiviert.',notFound:'Nutzer nicht gefunden.',generic:'Das Account-Orakel ist gerade beleidigt.',optionalHint:'Optional: weiter ohne Login spielen ist ausdrücklich erlaubt.',totp:'2FA-Code',totpNeed:'2FA aktiv: Bitte den 6-stelligen Code eingeben.',totpBad:'2FA-Code falsch oder abgelaufen.',twofa:'Zwei-Faktor-Authentifizierung (2FA)'},
    en:{profile:'Profile',login:'Profile',account:'Profile',logout:'Log out',name:'Username',display:'Display name',password:'Password',signin:'Sign in',register:'Register',save:'Save',cancel:'Cancel',create:'Create account',have:'Already have an account? Sign in',need:'No account yet? Register',logged:'Signed in as',optionalTitle:'Optional profile',optionalText:'You do not need a login to play. Accounts are only for achievements, friends and eventually a shelf full of questionable glory.',tabProfile:'Profile',tabAch:'Achievements',tabFriends:'Friends',achTitle:'Achievements',achEmpty:'No achievements yet. The dice only keep score when you are signed in.',friendsTitle:'Friends list',friendsEmpty:'No friends yet. Add a username and pretend this is social.',friendName:'Username',addFriend:'Add friend',searchFriend:'Find friends',searchFriendPh:'Type a name…',noResults:'No matches.',friendMark:'Friend ✓',remove:'Remove',invalid:'Login failed. Username or password is wrong.',short:'Password needs at least 8 characters.',exists:'That username is already taken.',disabled:'Registration is currently disabled.',notFound:'User not found.',generic:'The account oracle is sulking.',optionalHint:'Optional: playing without login is very much allowed.',totp:'2FA code',totpNeed:'2FA is active: enter your 6-digit code.',totpBad:'Wrong or expired 2FA code.',twofa:'Two-factor authentication (2FA)'},
    fr:{profile:'Profil',login:'Profil',account:'Profil',logout:'Déconnexion',name:'Nom utilisateur',display:'Nom affiché',password:'Mot de passe',signin:'Se connecter',register:'Créer',save:'Enregistrer',cancel:'Annuler',create:'Créer un compte',have:'Déjà un compte ? Connexion',need:'Pas encore de compte ? Créer',logged:'Connecté comme',optionalTitle:'Profil optionnel',optionalText:'Pas besoin de compte pour jouer. Il sert seulement aux succès et à la liste d’amis.',tabProfile:'Profil',tabAch:'Succès',tabFriends:'Amis',achTitle:'Succès',achEmpty:'Aucun succès pour l’instant.',friendsTitle:'Liste d’amis',friendsEmpty:'Aucun ami pour l’instant.',friendName:'Nom utilisateur',addFriend:'Ajouter',searchFriend:'Chercher des amis',searchFriendPh:'Saisir un nom…',noResults:'Aucun résultat.',friendMark:'Ami ✓',remove:'Retirer',invalid:'Connexion échouée.',short:'Le mot de passe doit contenir 8 caractères.',exists:'Ce nom est déjà pris.',disabled:'Inscription désactivée.',notFound:'Utilisateur introuvable.',generic:'Le compte boude.',optionalHint:'Optionnel : jouer sans connexion reste permis.',totp:'Code 2FA',totpNeed:'2FA active : saisissez le code à 6 chiffres.',totpBad:'Code 2FA incorrect ou expiré.',twofa:'Authentification à deux facteurs (2FA)'},
    es:{profile:'Perfil',login:'Perfil',account:'Perfil',logout:'Salir',name:'Usuario',display:'Nombre visible',password:'Contraseña',signin:'Entrar',register:'Registrar',save:'Guardar',cancel:'Cancelar',create:'Crear cuenta',have:'¿Ya tienes cuenta? Entrar',need:'¿Sin cuenta? Registrar',logged:'Sesión como',optionalTitle:'Perfil opcional',optionalText:'No necesitas iniciar sesión para jugar. La cuenta solo sirve para logros y amigos.',tabProfile:'Perfil',tabAch:'Logros',tabFriends:'Amigos',achTitle:'Logros',achEmpty:'Sin logros todavía.',friendsTitle:'Lista de amigos',friendsEmpty:'Sin amigos todavía.',friendName:'Usuario',addFriend:'Añadir',searchFriend:'Buscar amigos',searchFriendPh:'Escribe un nombre…',noResults:'Sin resultados.',friendMark:'Amigo ✓',remove:'Eliminar',invalid:'Login fallido.',short:'La contraseña necesita 8 caracteres.',exists:'Ese nombre ya existe.',disabled:'Registro desactivado.',notFound:'Usuario no encontrado.',generic:'El oráculo de cuentas no responde.',optionalHint:'Opcional: puedes seguir jugando sin login.',totp:'Código 2FA',totpNeed:'2FA activa: introduce el código de 6 dígitos.',totpBad:'Código 2FA incorrecto o caducado.',twofa:'Autenticación en dos pasos (2FA)'},
    it:{profile:'Profilo',login:'Profilo',account:'Profilo',logout:'Esci',name:'Utente',display:'Nome visibile',password:'Password',signin:'Accedi',register:'Registrati',save:'Salva',cancel:'Annulla',create:'Crea account',have:'Hai già un account? Accedi',need:'Nessun account? Registrati',logged:'Accesso come',optionalTitle:'Profilo opzionale',optionalText:'Non serve il login per giocare. L’account serve solo per obiettivi e amici.',tabProfile:'Profilo',tabAch:'Obiettivi',tabFriends:'Amici',achTitle:'Obiettivi',achEmpty:'Nessun obiettivo ancora.',friendsTitle:'Lista amici',friendsEmpty:'Nessun amico ancora.',friendName:'Utente',addFriend:'Aggiungi',searchFriend:'Cerca amici',searchFriendPh:'Scrivi un nome…',noResults:'Nessun risultato.',friendMark:'Amico ✓',remove:'Rimuovi',invalid:'Accesso fallito.',short:'La password richiede almeno 8 caratteri.',exists:'Nome già usato.',disabled:'Registrazione disattivata.',notFound:'Utente non trovato.',generic:'L’oracolo account non risponde.',optionalHint:'Opzionale: puoi giocare senza login.',totp:'Codice 2FA',totpNeed:'2FA attiva: inserisci il codice a 6 cifre.',totpBad:'Codice 2FA errato o scaduto.',twofa:'Autenticazione a due fattori (2FA)'},
    ru:{profile:'Профиль',login:'Профиль',account:'Профиль',logout:'Выйти',name:'Имя',display:'Отображаемое имя',password:'Пароль',signin:'Войти',register:'Регистрация',save:'Сохранить',cancel:'Отмена',create:'Создать аккаунт',have:'Уже есть аккаунт? Войти',need:'Нет аккаунта? Регистрация',logged:'Вы вошли как',optionalTitle:'Необязательный профиль',optionalText:'Для игры логин не нужен. Аккаунт только для достижений и друзей.',tabProfile:'Профиль',tabAch:'Достижения',tabFriends:'Друзья',achTitle:'Достижения',achEmpty:'Пока нет достижений.',friendsTitle:'Список друзей',friendsEmpty:'Пока нет друзей.',friendName:'Имя',addFriend:'Добавить',searchFriend:'Поиск друзей',searchFriendPh:'Введите имя…',noResults:'Ничего не найдено.',friendMark:'Друг ✓',remove:'Удалить',invalid:'Ошибка входа.',short:'Пароль минимум 8 символов.',exists:'Имя уже занято.',disabled:'Регистрация отключена.',notFound:'Пользователь не найден.',generic:'Система аккаунтов молчит.',optionalHint:'Необязательно: можно играть без входа.',totp:'Код 2FA',totpNeed:'Включена 2FA: введите 6-значный код.',totpBad:'Неверный или устаревший код 2FA.',twofa:'Двухфакторная аутентификация (2FA)'},
    zh:{profile:'资料',login:'资料',account:'资料',logout:'退出',name:'用户名',display:'显示名称',password:'密码',signin:'登录',register:'注册',save:'保存',cancel:'取消',create:'创建账户',have:'已有账户？登录',need:'没有账户？注册',logged:'已登录为',optionalTitle:'可选资料',optionalText:'玩游戏不需要登录。账户只用于成就和好友列表。',tabProfile:'资料',tabAch:'成就',tabFriends:'好友',achTitle:'成就',achEmpty:'暂无成就。',friendsTitle:'好友列表',friendsEmpty:'暂无好友。',friendName:'用户名',addFriend:'添加好友',searchFriend:'查找好友',searchFriendPh:'输入名称…',noResults:'没有结果。',friendMark:'好友 ✓',remove:'移除',invalid:'登录失败。',short:'密码至少 8 个字符。',exists:'用户名已存在。',disabled:'注册已关闭。',notFound:'用户不存在。',generic:'账户系统暂时不理人。',optionalHint:'可选：不登录也可以继续玩。',totp:'2FA 验证码',totpNeed:'已启用 2FA：请输入 6 位验证码。',totpBad:'2FA 验证码错误或已过期。',twofa:'两步验证（2FA）'},
    ja:{profile:'プロフィール',login:'プロフィール',account:'プロフィール',logout:'ログアウト',name:'ユーザー名',display:'表示名',password:'パスワード',signin:'ログイン',register:'登録',save:'保存',cancel:'キャンセル',create:'アカウント作成',have:'アカウントあり？ログイン',need:'未登録？登録',logged:'ログイン中',optionalTitle:'任意プロフィール',optionalText:'遊ぶのにログインは不要です。アカウントは実績とフレンド一覧用です。',tabProfile:'プロフィール',tabAch:'実績',tabFriends:'フレンド',achTitle:'実績',achEmpty:'まだ実績はありません。',friendsTitle:'フレンド一覧',friendsEmpty:'まだフレンドはいません。',friendName:'ユーザー名',addFriend:'追加',searchFriend:'フレンドを探す',searchFriendPh:'名前を入力…',noResults:'該当なし。',friendMark:'フレンド ✓',remove:'削除',invalid:'ログイン失敗。',short:'パスワードは8文字以上。',exists:'その名前は使用済み。',disabled:'登録は無効です。',notFound:'ユーザーが見つかりません。',generic:'アカウント神託が沈黙中。',optionalHint:'任意：ログインなしでも遊べます。',totp:'2FAコード',totpNeed:'2FA有効：6桁のコードを入力してください。',totpBad:'2FAコードが違うか期限切れです。',twofa:'二要素認証（2FA）'}
  };
  const lang = () => (i18n?.getLanguage?.() || navigator.language || 'de').slice(0,2).toLowerCase();
  const t = (k) => (L[lang()] || L.en)[k] || L.en[k] || k;
  const EXTRA = {
    de:{oauthTitle:'Oder mit E-Mail-Anbieter',google:'Mit Google anmelden',facebook:'Mit Facebook anmelden',oauthNote:'Wir speichern aus Google/Facebook nur deine E-Mail-Adresse. Kein Avatar, kein Profilname, kein Zugriffstoken.',support:'Kontakt & Passwortreset',forgot:'Passwort vergessen? Schreib an',linkTitle:'Verbundene Konten',linkHint:'Verbinde einen Anbieter, um dich künftig auch darüber anzumelden — dein Passwort bleibt gültig.',linkConnect:'Verbinden',linkDisconnect:'Trennen',linkLast:'Einzige Anmeldemöglichkeit — setze erst ein Passwort.',linkOk:'Konto verbunden.',linkTaken:'Dieses Anbieter-Konto gehört bereits zu einem anderen Profil.',linkAlready:'Dieser Anbieter ist bereits verbunden.',linkSession:'Sitzung abgelaufen. Bitte neu anmelden und erneut versuchen.',linkFailed:'Verbinden fehlgeschlagen.',otpTitle:'Zwei-Faktor-Bestätigung',otpText:'Dein Konto ist zusätzlich geschützt. Gib den 6-stelligen Code aus deiner App ein.',otpSubmit:'Anmelden',otpExpired:'Der Anmeldeversuch ist abgelaufen. Bitte erneut anmelden.'},
    en:{oauthTitle:'Or use an e-mail provider',google:'Continue with Google',facebook:'Continue with Facebook',oauthNote:'From Google/Facebook we store only your e-mail address. No avatar, no profile name, no access token.',support:'Contact & password reset',forgot:'Forgot your password? Write to',linkTitle:'Connected accounts',linkHint:'Connect a provider to sign in with it as well — your password keeps working.',linkConnect:'Connect',linkDisconnect:'Disconnect',linkLast:'Only sign-in method — set a password first.',linkOk:'Account connected.',linkTaken:'That provider account already belongs to another profile.',linkAlready:'This provider is already connected.',linkSession:'Session expired. Please sign in again and retry.',linkFailed:'Connecting failed.',otpTitle:'Two-factor confirmation',otpText:'Your account has a second factor. Enter the 6-digit code from your app.',otpSubmit:'Sign in',otpExpired:'This sign-in attempt expired. Please start again.'},
    fr:{oauthTitle:'Ou via fournisseur e-mail',google:'Continuer avec Google',facebook:'Continuer avec Facebook',oauthNote:'Depuis Google/Facebook nous ne stockons que votre adresse e-mail.',support:'Contact & réinitialisation',forgot:'Mot de passe oublié ? Écris à',linkTitle:'Comptes liés',linkHint:'Liez un fournisseur pour vous connecter aussi par ce biais — votre mot de passe reste valable.',linkConnect:'Lier',linkDisconnect:'Délier',linkLast:'Seule méthode de connexion — définissez d’abord un mot de passe.',linkOk:'Compte lié.',linkTaken:'Ce compte fournisseur appartient déjà à un autre profil.',linkAlready:'Ce fournisseur est déjà lié.',linkSession:'Session expirée. Reconnectez-vous et réessayez.',linkFailed:'Échec de la liaison.',otpTitle:'Confirmation à deux facteurs',otpText:'Votre compte est protégé par un second facteur. Saisissez le code à 6 chiffres.',otpSubmit:'Se connecter',otpExpired:'Tentative expirée. Veuillez recommencer.'},
    es:{oauthTitle:'O con proveedor de correo',google:'Continuar con Google',facebook:'Continuar con Facebook',oauthNote:'De Google/Facebook solo guardamos tu correo electrónico.',support:'Contacto y restablecimiento',forgot:'¿Olvidaste la contraseña? Escribe a',linkTitle:'Cuentas vinculadas',linkHint:'Vincula un proveedor para entrar también con él — tu contraseña sigue valiendo.',linkConnect:'Vincular',linkDisconnect:'Desvincular',linkLast:'Único método de acceso — define antes una contraseña.',linkOk:'Cuenta vinculada.',linkTaken:'Esa cuenta del proveedor ya pertenece a otro perfil.',linkAlready:'Este proveedor ya está vinculado.',linkSession:'Sesión caducada. Vuelve a entrar e inténtalo de nuevo.',linkFailed:'No se pudo vincular.',otpTitle:'Confirmación en dos pasos',otpText:'Tu cuenta tiene un segundo factor. Introduce el código de 6 dígitos.',otpSubmit:'Entrar',otpExpired:'El intento ha caducado. Empieza de nuevo.'},
    it:{oauthTitle:'Oppure con provider e-mail',google:'Continua con Google',facebook:'Continua con Facebook',oauthNote:'Da Google/Facebook salviamo solo il tuo indirizzo e-mail.',support:'Contatto e reset password',forgot:'Password dimenticata? Scrivi a',linkTitle:'Account collegati',linkHint:'Collega un provider per accedere anche così — la password resta valida.',linkConnect:'Collega',linkDisconnect:'Scollega',linkLast:'Unico metodo di accesso — imposta prima una password.',linkOk:'Account collegato.',linkTaken:'Quell’account del provider appartiene già a un altro profilo.',linkAlready:'Questo provider è già collegato.',linkSession:'Sessione scaduta. Accedi di nuovo e riprova.',linkFailed:'Collegamento non riuscito.',otpTitle:'Conferma a due fattori',otpText:'Il tuo account ha un secondo fattore. Inserisci il codice a 6 cifre.',otpSubmit:'Accedi',otpExpired:'Tentativo scaduto. Ricomincia.'},
    ru:{oauthTitle:'Или через почтовый сервис',google:'Войти через Google',facebook:'Войти через Facebook',oauthNote:'Из Google/Facebook мы сохраняем только адрес e-mail.',support:'Контакт и сброс пароля',forgot:'Забыли пароль? Напишите',linkTitle:'Связанные аккаунты',linkHint:'Свяжите провайдера, чтобы входить и через него — пароль продолжает работать.',linkConnect:'Связать',linkDisconnect:'Отвязать',linkLast:'Единственный способ входа — сначала задайте пароль.',linkOk:'Аккаунт связан.',linkTaken:'Этот аккаунт провайдера уже принадлежит другому профилю.',linkAlready:'Этот провайдер уже связан.',linkSession:'Сеанс истёк. Войдите снова и повторите.',linkFailed:'Не удалось связать.',otpTitle:'Подтверждение входа',otpText:'В аккаунте включён второй фактор. Введите 6-значный код из приложения.',otpSubmit:'Войти',otpExpired:'Попытка входа истекла. Начните заново.'},
    zh:{oauthTitle:'或使用邮箱提供商',google:'使用 Google 登录',facebook:'使用 Facebook 登录',oauthNote:'来自 Google/Facebook 的数据只保存电子邮件地址。',support:'联系与密码重置',forgot:'忘记密码？请写信至',linkTitle:'已关联账户',linkHint:'关联一个提供商后也可用它登录 — 你的密码仍然有效。',linkConnect:'关联',linkDisconnect:'解除关联',linkLast:'这是唯一的登录方式 — 请先设置密码。',linkOk:'账户已关联。',linkTaken:'该提供商账户已属于另一个个人资料。',linkAlready:'该提供商已关联。',linkSession:'会话已过期。请重新登录后再试。',linkFailed:'关联失败。',otpTitle:'两步验证',otpText:'你的账户启用了第二重验证。请输入应用中的 6 位验证码。',otpSubmit:'登录',otpExpired:'本次登录尝试已过期，请重新开始。'},
    ja:{oauthTitle:'またはメール事業者で',google:'Googleで続行',facebook:'Facebookで続行',oauthNote:'Google/Facebook から保存するのはメールアドレスのみです。',support:'連絡先・パスワード再設定',forgot:'パスワードを忘れた場合は',linkTitle:'連携済みアカウント',linkHint:'連携すると、その事業者でもログインできます（パスワードも引き続き有効）。',linkConnect:'連携する',linkDisconnect:'連携を解除',linkLast:'唯一のログイン方法です — 先にパスワードを設定してください。',linkOk:'アカウントを連携しました。',linkTaken:'その事業者アカウントは既に別のプロフィールに属しています。',linkAlready:'この事業者は既に連携済みです。',linkSession:'セッションが失効しました。ログインし直してからお試しください。',linkFailed:'連携に失敗しました。',otpTitle:'二段階認証',otpText:'このアカウントは二段階認証で保護されています。アプリの6桁コードを入力してください。',otpSubmit:'ログイン',otpExpired:'ログイン手続きの有効期限が切れました。最初からやり直してください。'}
  };
  const tx = (k) => (EXTRA[lang()] || EXTRA.en)[k] || EXTRA.en[k] || k;
  const supportEmail = () => CONFIG.supportEmail || state.supportEmail || 'support@brettspiele.fun';
  let state = { authenticated:false, user:null };
  // Rückmeldung des letzten Verknüpfungsversuchs; wird beim Öffnen des
  // Profils einmalig angezeigt (der OAuth-Weg führt über einen Seitenwechsel,
  // eine Meldung im Speicher überlebt den nicht).
  let linkNotice = '';

  async function api(path, body) {
    const opts = { credentials:'include', headers:{'Content-Type':'application/json'} };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || 'error'), { data, status: res.status });
    return data;
  }
  async function refresh() {
    try { state = await api('/api/me'); } catch (e) { state = { authenticated:false, user:null }; }
    renderButtons();
    window.dispatchEvent(new CustomEvent('brettspiele-auth-change', { detail: state }));
    maybeUnlockGameVisit();
    return state;
  }
  function buttonHtml() {
    const label = state.authenticated && state.user ? (state.user.displayName || state.user.username) : t('login');
    return `<button class="account-button" data-auth-open type="button">${escapeHtml(label)}</button>`;
  }
  function renderButtons() {
    document.querySelectorAll('[data-auth-slot]').forEach((slot) => { slot.innerHTML = buttonHtml(); });
    document.querySelectorAll('[data-auth-open]').forEach((b) => b.addEventListener('click', openModal));
  }
  function ensureSlots() {
    const nav = document.querySelector('.nav-actions');
    if (nav && !nav.querySelector('[data-auth-slot]')) {
      const span = document.createElement('span'); span.dataset.authSlot = '1'; span.className = 'auth-slot';
      const donate = nav.querySelector('[data-donate-slot]');
      nav.insertBefore(span, donate || nav.firstChild);
    }
    document.querySelectorAll('.game-top-actions').forEach((bar) => {
      if (!bar.querySelector('[data-auth-slot]')) {
        const span = document.createElement('span'); span.dataset.authSlot = '1'; span.className = 'auth-slot';
        bar.appendChild(span);
      }
    });
  }
  function msgFor(err) {
    const e = err?.data?.error || '';
    if (e === 'invalid_login') return t('invalid');
    if (e === 'password_too_short') return t('short');
    if (e === 'user_exists') return t('exists');
    if (e === 'registration_disabled') return t('disabled');
    if (e === 'friend_not_found') return t('notFound');
    if (e === 'totp_required') return t('totpNeed');
    if (e === 'totp_invalid') return t('totpBad');
    if (e === 'oauth_last_method') return tx('linkLast');
    if (e === 'oauth_2fa_expired') return tx('otpExpired');
    return t('generic');
  }
  function openModal() {
    document.querySelector('.auth-backdrop')?.remove();
    const mode = state.authenticated ? 'profile' : 'login';
    const el = document.createElement('div');
    el.className = 'auth-backdrop';
    el.innerHTML = modalHtml(mode);
    document.body.appendChild(el);
    wireModal(el, mode);
  }
  function oauthButtons() {
    const google = !!CONFIG.oauth?.google;
    const facebook = !!CONFIG.oauth?.facebook;
    if (!google && !facebook) return '';
    return `<div class="auth-oauth"><div class="auth-oauth-title">${tx('oauthTitle')}</div>${google ? `<button type="button" data-auth-oauth="google"><b>G</b>${tx('google')}</button>` : ''}${facebook ? `<button type="button" data-auth-oauth="facebook"><b>f</b>${tx('facebook')}</button>` : ''}</div>`;
  }
  function oauthStart(provider, mode) {
    const next = location.pathname + location.search + location.hash;
    const extra = mode === 'link' ? '&mode=link' : '';
    location.href = `/api/auth/oauth/${encodeURIComponent(provider)}/start?next=${encodeURIComponent(next)}${extra}`;
  }
  // Verbundene Anbieter im Profil: verbinden geht über denselben OAuth-Weg wie
  // der Login (nur mit mode=link), trennen über einen kleinen POST.
  function linkedAccounts() {
    const providers = [['google', tx('google')], ['facebook', tx('facebook')]].filter(([id]) => !!CONFIG.oauth?.[id]);
    if (!providers.length) return '';
    const linked = state.user?.authProviders || [];
    const hasPassword = !!state.user?.hasPassword;
    const rows = providers.map(([id, label]) => {
      const on = linked.includes(id);
      const last = on && !hasPassword && linked.length < 2;
      const btn = on
        ? `<button type="button" class="auth-danger" data-auth-unlink="${id}"${last ? ' disabled title="' + escapeHtml(tx('linkLast')) + '"' : ''}>${tx('linkDisconnect')}</button>`
        : `<button type="button" data-auth-link="${id}">${tx('linkConnect')}</button>`;
      return `<div class="auth-link-row"><span><b>${id === 'google' ? 'G' : 'f'}</b> ${escapeHtml(label)}</span>${btn}</div>`;
    }).join('');
    const notice = linkNotice ? `<p class="auth-note" data-auth-link-note>${escapeHtml(linkNotice)}</p>` : '';
    linkNotice = '';
    return `<div class="auth-card" style="margin-top:12px"><h3>${tx('linkTitle')}</h3>${notice}${rows}<p class="auth-note">${tx('linkHint')}</p></div>`;
  }
  function modalHtml(mode) {
    if (mode === 'profile') {
      const name = escapeHtml(state.user?.displayName || state.user?.username || '');
      return `<section class="auth-modal" role="dialog" aria-modal="true"><button class="auth-x" data-auth-close>×</button><h2>${t('account')}</h2><p class="auth-sub">${t('logged')} <strong>${name}</strong>. ${t('optionalText')}</p><div class="auth-tabs" role="tablist"><button data-auth-tab="profile" aria-selected="true">${t('tabProfile')}</button><button data-auth-tab="achievements" aria-selected="false">${t('tabAch')}</button><button data-auth-tab="friends" aria-selected="false">${t('tabFriends')}</button></div><section class="auth-section active" data-auth-section="profile"><form data-auth-profile><label>${t('display')}<input name="displayName" maxlength="40" value="${escapeHtml(state.user?.displayName || '')}"></label><div class="auth-actions"><button type="button" class="auth-danger" data-auth-logout>${t('logout')}</button><button type="submit">${t('save')}</button></div></form>${(state.user?.caps?.creator || state.user?.isAdmin) ? '<p class="auth-admin-link" style="margin-top:10px"><a class="auth-link" href="/studio/">🎲 Spiel erstellen (Studio)</a></p>' : ''}${(state.user?.isAdmin || state.user?.caps?.ai || state.user?.caps?.creator) ? '<p class="auth-admin-link" style="margin-top:6px"><a class="auth-link" href="/code/">⌨️ Code-Terminal</a></p>' : ''}${state.user?.isAdmin ? '<p class="auth-admin-link" style="margin-top:6px"><a class="auth-link" href="/admin/">🛡 Administration</a></p>' : ''}<p class="auth-admin-link" style="margin-top:6px"><a class="auth-link" href="/account/2fa/">🔐 ${t('twofa')}${state.user?.twofaEnabled ? ' ✔' : (state.user?.twofaRequired ? ' ⚠' : '')}</a></p>${linkedAccounts()}</section><section class="auth-section" data-auth-section="achievements"><div class="auth-card"><h3>${t('achTitle')}</h3><div data-auth-achievements class="auth-list"><p class="auth-empty">${t('achEmpty')}</p></div></div></section><section class="auth-section" data-auth-section="friends"><div class="auth-card"><h3>${t('friendsTitle')}</h3><label class="auth-friend-search" style="display:block;margin-bottom:10px">${t('searchFriend')}<input data-auth-friend-search type="search" maxlength="32" autocomplete="off" placeholder="${t('searchFriendPh')}" style="width:100%"></label><div data-auth-friend-results class="auth-list"></div><div data-auth-friends class="auth-list"><p class="auth-empty">${t('friendsEmpty')}</p></div></div></section><p class="auth-error" data-auth-error></p></section>`;
    }
    const isRegister = mode === 'register';
    return `<section class="auth-modal" role="dialog" aria-modal="true"><button class="auth-x" data-auth-close>×</button><h2>${isRegister ? t('create') : t('optionalTitle')}</h2><p class="auth-sub">${t('optionalText')} <span class="auth-badge">${t('optionalHint')}</span></p>${!isRegister ? oauthButtons() : ''}<form data-auth-form><label>${t('name')}<input name="username" required minlength="3" maxlength="32" autocomplete="username"></label>${isRegister ? `<label>${t('display')}<input name="displayName" maxlength="40" autocomplete="nickname"></label>` : ''}<label>${t('password')}<input name="password" type="password" required minlength="8" autocomplete="${isRegister ? 'new-password' : 'current-password'}"></label>${!isRegister ? `<label data-auth-totp-row style="display:none">${t('totp')}<input name="totp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label>` : ''}<div class="auth-actions"><button type="button" class="auth-ghost" data-auth-close>${t('cancel')}</button><button type="submit">${isRegister ? t('register') : t('signin')}</button></div></form><button class="auth-link" data-auth-switch type="button">${isRegister ? t('have') : t('need')}</button><p class="auth-support">${tx('forgot')} <a href="mailto:${escapeHtml(supportEmail())}">${escapeHtml(supportEmail())}</a></p><p class="auth-error" data-auth-error></p></section>`;
  }
  function wireModal(el, mode) {
    const close = () => el.remove();
    el.addEventListener('click', (e) => { if (e.target === el || e.target.matches('[data-auth-close]')) close(); });
    el.querySelector('[data-auth-switch]')?.addEventListener('click', () => { el.innerHTML = modalHtml(mode === 'register' ? 'login' : 'register'); wireModal(el, mode === 'register' ? 'login' : 'register'); });
    el.querySelectorAll('[data-auth-oauth]').forEach((b) => b.addEventListener('click', () => oauthStart(b.dataset.authOauth)));
    el.querySelectorAll('[data-auth-link]').forEach((b) => b.addEventListener('click', () => oauthStart(b.dataset.authLink, 'link')));
    el.querySelectorAll('[data-auth-unlink]').forEach((b) => b.addEventListener('click', async () => {
      const provider = b.dataset.authUnlink;
      b.disabled = true;
      try {
        state = await api(`/api/auth/oauth/${encodeURIComponent(provider)}/unlink`, {});
        linkNotice = '';
        await refresh();
        el.innerHTML = modalHtml('profile');
        wireModal(el, 'profile');
      } catch (err) {
        b.disabled = false;
        el.querySelector('[data-auth-error]').textContent = msgFor(err);
      }
    }));
    el.querySelector('[data-auth-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = { username: fd.get('username'), password: fd.get('password'), displayName: fd.get('displayName'), totp: fd.get('totp') || undefined };
      try {
        const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
        state = await api(endpoint, payload);
        await refresh();
        if (mode === 'register') await unlock({ id:'account-created', game:'site', title:t('create'), description:t('optionalText') });
        close();
      } catch (err) {
        // 2FA aktiv: Code-Feld einblenden und dort weitermachen.
        if (err?.data?.error === 'totp_required' || err?.data?.error === 'totp_invalid') {
          const row = el.querySelector('[data-auth-totp-row]');
          if (row) { row.style.display = ''; row.querySelector('input')?.focus(); }
        }
        el.querySelector('[data-auth-error]').textContent = msgFor(err);
      }
    });
    el.querySelector('[data-auth-profile]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { state = await api('/api/auth/profile', { displayName: new FormData(e.currentTarget).get('displayName') }); close(); await refresh(); }
      catch (err) { el.querySelector('[data-auth-error]').textContent = msgFor(err); }
    });
    el.querySelector('[data-auth-logout]')?.addEventListener('click', async () => { try { await api('/api/auth/logout', {}); } catch (e) {} close(); await refresh(); });
    el.querySelectorAll('[data-auth-tab]').forEach((btn) => btn.addEventListener('click', () => switchTab(el, btn.dataset.authTab)));
    const friendSearch = el.querySelector('[data-auth-friend-search]');
    if (friendSearch) {
      let searchTimer = null;
      friendSearch.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = friendSearch.value.trim();
        const box = el.querySelector('[data-auth-friend-results]');
        if (q.length < 2) { if (box) box.innerHTML = ''; return; }
        searchTimer = setTimeout(() => searchFriends(el, q), 250);
      });
    }
    if (mode === 'profile') { loadAchievements(el); loadFriends(el); }
  }
  async function searchFriends(el, q) {
    const box = el.querySelector('[data-auth-friend-results]');
    if (!box) return;
    try {
      const data = await api('/api/users/search?q=' + encodeURIComponent(q));
      const items = data.items || [];
      if (!items.length) { box.innerHTML = `<p class="auth-empty">${t('noResults')}</p>`; return; }
      box.innerHTML = items.map((u) => `<div class="auth-item"><div><strong>${escapeHtml(u.displayName || u.username)}</strong><small>@${escapeHtml(u.username)}</small></div>${u.isFriend ? `<span class="auth-badge">${t('friendMark')}</span>` : `<button class="auth-ghost" data-auth-friend-add-btn="${escapeHtml(u.username)}">${t('addFriend')}</button>`}</div>`).join('');
      box.querySelectorAll('[data-auth-friend-add-btn]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api('/api/friend/add', { username: b.dataset.authFriendAddBtn });
          await loadFriends(el);
          const input = el.querySelector('[data-auth-friend-search]');
          if (input && input.value.trim().length >= 2) await searchFriends(el, input.value.trim());
        } catch (err) { el.querySelector('[data-auth-error]').textContent = msgFor(err); }
      }));
    } catch (e) { box.innerHTML = `<p class="auth-empty">${t('noResults')}</p>`; }
  }
  function switchTab(el, tab) {
    el.querySelectorAll('[data-auth-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.authTab === tab)));
    el.querySelectorAll('[data-auth-section]').forEach((s) => s.classList.toggle('active', s.dataset.authSection === tab));
  }
  async function loadAchievements(el) {
    const box = el.querySelector('[data-auth-achievements]');
    if (!box) return;
    try {
      const data = await api('/api/achievements');
      const items = data.items || [];
      box.innerHTML = items.length ? items.map((a) => `<div class="auth-item"><div><strong>${escapeHtml(a.title || a.id)}</strong><small>${escapeHtml(a.description || '')}</small></div><span class="auth-badge">${escapeHtml(a.game || 'site')}</span></div>`).join('') : `<p class="auth-empty">${t('achEmpty')}</p>`;
    } catch (e) { box.innerHTML = `<p class="auth-empty">${t('achEmpty')}</p>`; }
  }
  async function loadFriends(el) {
    const box = el.querySelector('[data-auth-friends]');
    if (!box) return;
    try {
      const data = await api('/api/friends');
      const items = data.items || [];
      box.innerHTML = items.length ? items.map((f) => `<div class="auth-item"><div><strong>${escapeHtml(f.displayName || f.username)}</strong><small>@${escapeHtml(f.username)}</small></div><button class="auth-ghost" data-auth-friend-remove="${escapeHtml(f.username)}">${t('remove')}</button></div>`).join('') : `<p class="auth-empty">${t('friendsEmpty')}</p>`;
      box.querySelectorAll('[data-auth-friend-remove]').forEach((b) => b.addEventListener('click', async () => { await api('/api/friend/remove', { username: b.dataset.authFriendRemove }); await loadFriends(el); }));
    } catch (e) { box.innerHTML = `<p class="auth-empty">${t('friendsEmpty')}</p>`; }
  }
  function maybeUnlockGameVisit() {
    const game = document.documentElement.dataset.game;
    if (!state.authenticated || !game) return;
    const key = 'brettspiele.achievement.visit.' + game;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    unlock({ id:'visit-' + game, game, title: game === 'wurfwerk' ? 'Wurfwerk betreten' : game === 'lets-draw' ? 'Let\'s Draw betreten' : 'Spiel betreten', description:'Ein Tisch wurde betreten. Das zählt als soziale Leistung.' });
  }

  async function unlock(input) {
    if (!state.authenticated) await refresh();
    if (!state.authenticated) return { ok:false, optional:true, error:'not_authenticated' };
    const payload = typeof input === 'string' ? { id: input } : (input || {});
    try {
      const data = await api('/api/achievement', payload);
      window.dispatchEvent(new CustomEvent('brettspiele-achievement-unlocked', { detail: payload }));
      return data;
    } catch (e) { return { ok:false, error:e?.data?.error || 'error' }; }
  }
  function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  // Der Anbieter schickt den Browser mit ?link=… bzw. ?oauth2fa=… zurück.
  // Beide Parameter werden ausgewertet und sofort aus der Adresszeile
  // entfernt — ein Einmal-Token gehört nicht in Verlauf oder Lesezeichen.
  function handleAuthReturn() {
    const params = new URLSearchParams(location.search);
    const link = params.get('link');
    const otp = params.get('oauth2fa');
    if (!link && !otp) return;
    params.delete('link'); params.delete('oauth2fa');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    if (otp) { openOtpModal(otp); return; }
    linkNotice = link === 'ok' ? tx('linkOk')
      : link === 'taken' ? tx('linkTaken')
      : link === 'already' ? tx('linkAlready')
      : link === 'session' ? tx('linkSession')
      : tx('linkFailed');
    openModal();
    if (!state.authenticated) {
      const box = document.querySelector('.auth-backdrop [data-auth-error]');
      if (box) box.textContent = linkNotice;
      linkNotice = '';
    }
  }
  function openOtpModal(token) {
    document.querySelector('.auth-backdrop')?.remove();
    const el = document.createElement('div');
    el.className = 'auth-backdrop';
    el.innerHTML = `<section class="auth-modal" role="dialog" aria-modal="true"><button class="auth-x" data-auth-close>×</button><h2>${tx('otpTitle')}</h2><p class="auth-sub">${tx('otpText')}</p><form data-auth-otp><label>${t('totp')}<input name="totp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label><div class="auth-actions"><button type="submit">${tx('otpSubmit')}</button></div></form><p class="auth-error" data-auth-error></p></section>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => { if (e.target === el || e.target.matches('[data-auth-close]')) close(); });
    el.querySelector('[data-auth-otp]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = new FormData(e.currentTarget).get('totp');
      try {
        state = await api('/api/auth/oauth/2fa', { token, totp: code });
        close();
        await refresh();
      } catch (err) {
        el.querySelector('[data-auth-error]').textContent = msgFor(err);
      }
    });
    el.querySelector('input[name="totp"]')?.focus();
  }
  function init() { ensureSlots(); refresh().then(handleAuthReturn); }
  window.BrettAuth = { refresh, getState: () => state, open: openModal, api };
  window.BrettAchievements = { unlock };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('brettspiele-language-change', () => { ensureSlots(); renderButtons(); });
})();
