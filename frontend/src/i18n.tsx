// Lightweight i18n for Travel Space.
//
// Six languages ship out of the box. The active language is persisted to
// AsyncStorage. The `t()` helper does dot-path lookup and simple `{name}`
// interpolation.
//
// Any place that shows a raw string should ideally read it through `t()`
// so users get their language of choice everywhere — including labels
// that come back from geocoding and AI parsing.

import React from "react";
import { storage } from "@/src/utils/storage";

export type Lang = "en" | "zh" | "es" | "fr" | "de" | "ja";

export const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "zh", label: "Chinese (Simplified)", native: "简体中文" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ja", label: "Japanese", native: "日本語" },
];

// Nominatim understands standard BCP-47 tags; keep it simple.
export function nominatimLang(code: Lang): string {
  return { en: "en", zh: "zh-CN", es: "es", fr: "fr", de: "de", ja: "ja" }[code];
}

// -- Strings ---------------------------------------------------------------
// Only the strings that appear in main flows are translated; the rest fall
// back to English via `t()`'s fallback path.
const en = {
  common: {
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    close: "Close",
    done: "Done",
    retry: "Retry",
    dismiss: "Dismiss",
    settings: "Settings",
    signIn: "Sign in",
    signOut: "Sign out",
    ok: "OK",
    import: "Import",
    export: "Export",
    share: "Share",
    yes: "Yes",
    no: "No",
    of: "of",
    tryAgain: "Try again",
    unresolved: "No address match — please pick manually",
  },
  home: {
    title: "Travel Space",
    subtitle: "Travel itinerary made easy — bring all your bookings to one Travel Space.",
    tabs: { upcoming: "Upcoming", past: "Past", wishlist: "Wishlist" },
    guestMode: "Guest mode · saved on this device only",
    offlinePending: "Offline · {n} change{plural} queued",
    offlineIdle: "Offline · changes will sync when you're back online",
    syncing: "Syncing {n} change{plural}…",
    waiting: "{n} change{plural} waiting",
    failed: "{n} change{plural} couldn't be applied",
    empty: "No {tab} trips yet",
    emptySub: "Tap the button below to plan your next escape.",
    importTrip: "Import a trip file",
    leavesIn: "Leaves in {n} day{plural}",
    todayIsTheDay: "Today's the day!",
    onTheTrip: "On the trip",
    sharedWithYou: "Shared with you",
    peopleCount: "{n} people",
  },
  login: {
    signInGoogle: "Sign in with Google",
    guest: "Continue without signing in",
    tos: "Guest trips are stored only on this device. Sign in to sync and share across devices.",
    subtitle: "Everything works offline. Signing in is optional — only if you want cloud backup and sharing.",
  },
  settings: {
    title: "Settings",
    language: "Language",
    languageHint: "Applies to app labels and to automatically fetched addresses.",
    account: "Account",
    deleteAccount: "Delete my account",
    deleteAccountBody: "Permanently remove your Travel Space account and every trip you own. This can't be undone.",
    localData: "Local device data",
    clearLocal: "Erase local trips on this device",
    clearLocalBody: "Removes all locally-saved trips from this browser / device only. Nothing on your account is touched.",
    signInPrompt: "Sign in with Google (optional)",
    signInPromptBody: "Back up trips to the cloud and share them with others. Everything keeps working offline.",
  },
  autoAdd: {
    title: "Auto-import bookings",
    intro: "Paste a booking confirmation, or upload a screenshot / PDF (single OR multi-booking). Everything detected is classified and added to the right tab with a linked ticket.",
    section1: "1. Add a screenshot or PDF",
    section2: "2. Or paste confirmation text",
    pickImage: "Pick a booking screenshot",
    pickPdf: "Or attach a PDF booking",
    placeholder: "Paste your flight / hotel / activity confirmation text here…",
    import: "Import",
    detected: "Detected {n} item{plural}",
    imported: "{n} item{plural} imported",
    somefailed: "{ok} imported · {fail} could not be matched to an address",
    parseFailed: "Could not import",
    parseFailedBody: "Try a different image, PDF, or paste the confirmation text.",
    noneDetected: "No bookings detected. Try a clearer image or paste the text.",
  },
  tabs: {
    itinerary: "Itinerary",
    map: "Map",
    flights: "Flights",
    transport: "Transport",
    stays: "Stays",
    attractions: "Attractions",
    tickets: "Tickets",
    budget: "Budget",
    documents: "Documents",
  },
  addMenu: {
    title: "Add a trip",
    create: "Create new trip",
    createBody: "Start from a blank trip and fill it in.",
    importFile: "Import trip file",
    importFileBody: "Open a .travelspace.json a friend shared.",
    scanQr: "Scan a trip QR",
    scanQrBody: "Point your camera at someone's trip QR.",
  },
  share: {
    exportJson: "Export trip file",
    exportJsonBody: "Save the whole trip (all tabs) as a Travel Space file. Share it via AirDrop, Bluetooth, email, or WiFi.",
    exportQr: "Show QR code",
    exportQrBody: "Small trips can be transferred by scanning a QR code with the other device.",
    importFile: "Import trip file",
    importFileBody: "Restore a trip from a Travel Space file that a friend shared with you.",
    importQr: "Scan QR code",
    merge: "Merge into existing trip",
    replace: "Add as a new trip",
    mergeAsk: "How should this trip be added?",
    mergedOk: "{n} item{plural} merged",
    replacedOk: "Trip imported",
    invalidFile: "This doesn't look like a Travel Space trip file.",
  },
};

type Dict = typeof en;

// Non-English packs. Only the user-facing labels most likely to be seen
// need translation; missing keys fall through to English.
const zh: DeepPartial<Dict> = {
  common: { cancel: "取消", save: "保存", delete: "删除", edit: "编辑", add: "添加", close: "关闭", done: "完成", retry: "重试", dismiss: "关闭", settings: "设置", signIn: "登录", signOut: "退出", ok: "确定", import: "导入", export: "导出", share: "分享", yes: "是", no: "否", of: "于", tryAgain: "重试", unresolved: "无匹配地址 — 请手动选择" },
  home: {
    title: "旅行空间",
    subtitle: "让行程规划更简单 — 将所有预订整合到一个旅行空间。",
    tabs: { upcoming: "即将出发", past: "已完成", wishlist: "心愿单" },
    guestMode: "访客模式 · 仅保存在此设备上",
    offlinePending: "离线 · {n} 项更改等待同步",
    offlineIdle: "离线 · 联网后自动同步",
    syncing: "正在同步 {n} 项更改…",
    waiting: "{n} 项更改等待中",
    failed: "{n} 项更改未能应用",
    empty: "还没有 {tab} 行程",
    emptySub: "点击下方按钮开始规划下一次旅行。",
    importTrip: "导入行程文件",
    leavesIn: "还有 {n} 天出发",
    todayIsTheDay: "今天就出发!",
    onTheTrip: "旅行中",
    sharedWithYou: "与你共享",
    peopleCount: "{n} 人",
  },
  login: {
    signInGoogle: "使用 Google 登录",
    guest: "不登录直接使用",
    tos: "访客数据仅保存在此设备上。登录可跨设备同步与共享。",
    subtitle: "一切均可离线使用。登录是可选的 —— 仅用于云端备份与共享。",
  },
  settings: {
    title: "设置",
    language: "语言",
    languageHint: "应用界面文字与自动获取的地址均使用此语言。",
    account: "账户",
    deleteAccount: "删除我的账户",
    deleteAccountBody: "永久删除旅行空间账户及你拥有的所有行程。此操作不可撤销。",
    localData: "本地数据",
    clearLocal: "清除本设备的本地行程",
    clearLocalBody: "仅清除本浏览器 / 本设备上保存的行程,不影响你的云端账户。",
    signInPrompt: "使用 Google 登录(可选)",
    signInPromptBody: "将行程备份到云端并与他人共享。离线时仍可使用。",
  },
  autoAdd: {
    title: "自动导入预订",
    intro: "粘贴预订确认信息,或上传截图 / PDF(单条或多条)。系统会自动识别并分类到对应标签页。",
    section1: "1. 添加截图或 PDF",
    section2: "2. 或粘贴确认文本",
    pickImage: "选择预订截图",
    pickPdf: "或附加 PDF 文件",
    placeholder: "在此粘贴机票 / 酒店 / 活动的确认文本…",
    import: "导入",
    detected: "检测到 {n} 项",
    imported: "已导入 {n} 项",
    somefailed: "{ok} 项已导入 · {fail} 项无法匹配地址",
    parseFailed: "导入失败",
    parseFailedBody: "请尝试其他图片、PDF 或粘贴确认文本。",
    noneDetected: "未检测到预订。请尝试更清晰的图片或直接粘贴文本。",
  },
  tabs: { itinerary: "行程", map: "地图", flights: "航班", transport: "交通", stays: "住宿", attractions: "景点", tickets: "票据", budget: "预算", documents: "文件" },
  addMenu: {
    title: "添加行程",
    create: "创建新行程",
    createBody: "从空白开始填写。",
    importFile: "导入行程文件",
    importFileBody: "打开朋友分享的 .travelspace.json 文件。",
    scanQr: "扫描行程二维码",
    scanQrBody: "对准其他人的行程二维码。",
  },
  share: {
      exportJson: "导出行程文件",
    exportJsonBody: "将整个行程(所有标签页)保存为文件。可通过 AirDrop、蓝牙、邮件或 WiFi 分享。",
    exportQr: "显示二维码",
    exportQrBody: "小型行程可通过扫描二维码在设备间传输。",
    importFile: "导入行程文件",
    importFileBody: "从朋友分享的旅行空间文件恢复行程。",
    importQr: "扫描二维码",
    merge: "合并到现有行程",
    replace: "作为新行程添加",
    mergeAsk: "如何添加此行程?",
    mergedOk: "已合并 {n} 项",
    replacedOk: "行程已导入",
    invalidFile: "该文件似乎不是有效的旅行空间行程文件。",
  },
};

const es: DeepPartial<Dict> = {
  common: { cancel: "Cancelar", save: "Guardar", delete: "Eliminar", edit: "Editar", add: "Añadir", close: "Cerrar", done: "Listo", retry: "Reintentar", dismiss: "Descartar", settings: "Ajustes", signIn: "Iniciar sesión", signOut: "Cerrar sesión", ok: "OK", import: "Importar", export: "Exportar", share: "Compartir", yes: "Sí", no: "No", of: "de", tryAgain: "Reintentar", unresolved: "Sin coincidencia — elige manualmente" },
  home: { title: "Travel Space", subtitle: "Planifica tu viaje sin esfuerzo — reúne todas tus reservas en un solo lugar.", tabs: { upcoming: "Próximos", past: "Pasados", wishlist: "Deseos" }, empty: "Aún no hay viajes {tab}", emptySub: "Toca el botón para planear tu próxima aventura.", leavesIn: "Sale en {n} día{plural}", todayIsTheDay: "¡Es hoy!", onTheTrip: "De viaje" },
  login: { signInGoogle: "Iniciar sesión con Google", guest: "Continuar sin iniciar sesión", subtitle: "Todo funciona sin conexión. Iniciar sesión es opcional." },
  settings: { title: "Ajustes", language: "Idioma", languageHint: "Se aplica a la interfaz y a las direcciones obtenidas automáticamente." },
  autoAdd: { title: "Importar reservas", import: "Importar", detected: "{n} reserva{plural} detectada{plural}" },
  tabs: { itinerary: "Itinerario", map: "Mapa", flights: "Vuelos", transport: "Transporte", stays: "Alojamiento", attractions: "Atracciones", tickets: "Billetes", budget: "Presupuesto", documents: "Documentos" },
};

const fr: DeepPartial<Dict> = {
  common: { cancel: "Annuler", save: "Enregistrer", delete: "Supprimer", edit: "Modifier", add: "Ajouter", close: "Fermer", done: "OK", retry: "Réessayer", dismiss: "Fermer", settings: "Réglages", signIn: "Connexion", signOut: "Déconnexion", ok: "OK", import: "Importer", export: "Exporter", share: "Partager", yes: "Oui", no: "Non", of: "de", tryAgain: "Réessayer", unresolved: "Aucune adresse trouvée — choisis-la manuellement" },
  home: { title: "Travel Space", subtitle: "L'itinéraire de voyage simplifié — toutes vos réservations au même endroit.", tabs: { upcoming: "À venir", past: "Passés", wishlist: "Envies" }, empty: "Aucun voyage {tab}", emptySub: "Appuie sur le bouton pour préparer ta prochaine escapade.", leavesIn: "Départ dans {n} jour{plural}", todayIsTheDay: "C'est aujourd'hui !", onTheTrip: "En voyage" },
  login: { signInGoogle: "Se connecter avec Google", guest: "Continuer sans se connecter", subtitle: "Tout fonctionne hors ligne. La connexion est facultative." },
  settings: { title: "Réglages", language: "Langue", languageHint: "S'applique à l'interface et aux adresses récupérées automatiquement." },
  autoAdd: { title: "Importer une réservation", import: "Importer", detected: "{n} réservation{plural} détectée{plural}" },
  tabs: { itinerary: "Itinéraire", map: "Carte", flights: "Vols", transport: "Transport", stays: "Hébergement", attractions: "Activités", tickets: "Billets", budget: "Budget", documents: "Documents" },
};

const de: DeepPartial<Dict> = {
  common: { cancel: "Abbrechen", save: "Speichern", delete: "Löschen", edit: "Bearbeiten", add: "Hinzufügen", close: "Schließen", done: "Fertig", retry: "Erneut", dismiss: "Schließen", settings: "Einstellungen", signIn: "Anmelden", signOut: "Abmelden", ok: "OK", import: "Importieren", export: "Exportieren", share: "Teilen", yes: "Ja", no: "Nein", of: "von", tryAgain: "Erneut versuchen", unresolved: "Keine Adresse gefunden — bitte manuell wählen" },
  home: { title: "Travel Space", subtitle: "Reiseplanung leicht gemacht — alle Buchungen an einem Ort.", tabs: { upcoming: "Bevorstehend", past: "Vergangen", wishlist: "Wunschliste" }, empty: "Noch keine {tab}-Reisen", emptySub: "Tippe unten, um deine nächste Reise zu planen.", leavesIn: "Abreise in {n} Tag{plural}", todayIsTheDay: "Heute geht's los!", onTheTrip: "Auf Reisen" },
  login: { signInGoogle: "Mit Google anmelden", guest: "Ohne Anmeldung fortfahren", subtitle: "Alles funktioniert offline. Anmelden ist optional." },
  settings: { title: "Einstellungen", language: "Sprache", languageHint: "Gilt für die App und automatisch geladene Adressen." },
  autoAdd: { title: "Buchung automatisch importieren", import: "Importieren", detected: "{n} Buchung{plural} erkannt" },
  tabs: { itinerary: "Reiseplan", map: "Karte", flights: "Flüge", transport: "Transport", stays: "Unterkunft", attractions: "Attraktionen", tickets: "Tickets", budget: "Budget", documents: "Dokumente" },
};

const ja: DeepPartial<Dict> = {
  common: { cancel: "キャンセル", save: "保存", delete: "削除", edit: "編集", add: "追加", close: "閉じる", done: "完了", retry: "再試行", dismiss: "閉じる", settings: "設定", signIn: "サインイン", signOut: "サインアウト", ok: "OK", import: "インポート", export: "エクスポート", share: "共有", yes: "はい", no: "いいえ", of: "の", tryAgain: "もう一度", unresolved: "住所が一致しません — 手動で選択してください" },
  home: { title: "Travel Space", subtitle: "旅程作成をシンプルに。すべての予約を一つの場所に。", tabs: { upcoming: "予定", past: "過去", wishlist: "行きたい" }, empty: "{tab}の旅行はまだありません", emptySub: "下のボタンで次の旅を計画しよう。", leavesIn: "出発まであと {n} 日", todayIsTheDay: "今日が旅行日!", onTheTrip: "旅行中" },
  login: { signInGoogle: "Google でサインイン", guest: "サインインせずに続ける", subtitle: "すべてオフラインで動作します。サインインは任意です。" },
  settings: { title: "設定", language: "言語", languageHint: "アプリの表示と自動取得される住所に適用されます。" },
  autoAdd: { title: "予約を自動取り込み", import: "取り込む", detected: "{n} 件の予約を検出" },
  tabs: { itinerary: "旅程", map: "地図", flights: "フライト", transport: "交通", stays: "宿泊", attractions: "観光", tickets: "チケット", budget: "予算", documents: "書類" },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const PACKS: Record<Lang, DeepPartial<Dict>> = { en, zh, es, fr, de, ja };

function pluck(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
}

function interpolate(str: string, vars?: Record<string, any>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === "plural") {
      const n = Number(vars.n ?? vars.count ?? 0);
      return n === 1 ? "" : "s";
    }
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

export function translate(lang: Lang, key: string, vars?: Record<string, any>): string {
  const pack = PACKS[lang] || PACKS.en;
  let val = pluck(pack, key);
  if (val == null) val = pluck(PACKS.en, key);
  if (val == null) return key;
  return interpolate(String(val), vars);
}

// -- React glue ------------------------------------------------------------
type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => Promise<void>;
  t: (key: string, vars?: Record<string, any>) => string;
};

const LangCtx = React.createContext<Ctx>({
  lang: "en",
  setLang: async () => {},
  t: (k) => k,
});

const LANG_KEY = "ts_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("en");

  React.useEffect(() => {
    (async () => {
      try {
        const stored = await storage.getItem<Lang | null>(LANG_KEY, null);
        if (stored && LANGUAGES.some((l) => l.code === stored)) {
          setLangState(stored);
        } else {
          // Guess from device locale
          const guess = guessLangFromDevice();
          if (guess) setLangState(guess);
        }
      } catch {}
    })();
  }, []);

  React.useEffect(() => { _updateGlobalLang(lang); }, [lang]);

  const setLang = React.useCallback(async (l: Lang) => {
    setLangState(l);
    _updateGlobalLang(l);
    try { await storage.setItem(LANG_KEY, l); } catch {}
  }, []);

  const t = React.useCallback((key: string, vars?: Record<string, any>) => translate(lang, key, vars), [lang]);

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useI18n() {
  return React.useContext(LangCtx);
}

function guessLangFromDevice(): Lang | null {
  try {
    if (typeof navigator !== "undefined" && navigator.language) {
      const code = navigator.language.slice(0, 2).toLowerCase();
      if (LANGUAGES.some((l) => l.code === code)) return code as Lang;
    }
  } catch {}
  return null;
}

// A synchronous getter for callers outside React (like the api layer that
// wants to send Accept-Language to Nominatim). Falls back to English.
let _currentLang: Lang = "en";
export function _updateGlobalLang(l: Lang) { _currentLang = l; }
export function currentLang(): Lang { return _currentLang; }
