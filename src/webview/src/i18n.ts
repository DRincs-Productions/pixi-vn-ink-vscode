export type Locale = "en" | "it" | "ru" | "zh-cn" | "ja" | "es" | "fr" | "ko" | "de";

type Key =
    | "back"
    | "restart"
    | "loadingStory"
    | "you"
    | "whatDoYouChoose"
    | "enterANumber"
    | "typeYourResponse"
    | "submit";

const dictionaries: Record<Locale, Record<Key, string>> = {
    en: {
        back: "Back",
        restart: "Restart",
        loadingStory: "Loading story...",
        you: "You",
        whatDoYouChoose: "What do you choose?",
        enterANumber: "Enter a number...",
        typeYourResponse: "Type your response...",
        submit: "Submit",
    },
    it: {
        back: "Indietro",
        restart: "Ricomincia",
        loadingStory: "Caricamento della storia...",
        you: "Tu",
        whatDoYouChoose: "Cosa scegli?",
        enterANumber: "Inserisci un numero...",
        typeYourResponse: "Scrivi la tua risposta...",
        submit: "Invia",
    },
    ru: {
        back: "Назад",
        restart: "Заново",
        loadingStory: "Загрузка истории...",
        you: "Вы",
        whatDoYouChoose: "Что вы выбираете?",
        enterANumber: "Введите число...",
        typeYourResponse: "Введите ваш ответ...",
        submit: "Отправить",
    },
    "zh-cn": {
        back: "返回",
        restart: "重新开始",
        loadingStory: "正在加载故事…",
        you: "你",
        whatDoYouChoose: "你选择什么?",
        enterANumber: "输入一个数字…",
        typeYourResponse: "输入你的回复…",
        submit: "提交",
    },
    ja: {
        back: "戻る",
        restart: "最初から",
        loadingStory: "物語を読み込み中…",
        you: "あなた",
        whatDoYouChoose: "どちらを選びますか?",
        enterANumber: "数字を入力してください…",
        typeYourResponse: "返答を入力してください…",
        submit: "送信",
    },
    es: {
        back: "Atrás",
        restart: "Reiniciar",
        loadingStory: "Cargando historia...",
        you: "Tú",
        whatDoYouChoose: "¿Qué eliges?",
        enterANumber: "Introduce un número...",
        typeYourResponse: "Escribe tu respuesta...",
        submit: "Enviar",
    },
    fr: {
        back: "Retour",
        restart: "Recommencer",
        loadingStory: "Chargement de l'histoire...",
        you: "Vous",
        whatDoYouChoose: "Que choisissez-vous ?",
        enterANumber: "Entrez un nombre...",
        typeYourResponse: "Saisissez votre réponse...",
        submit: "Envoyer",
    },
    ko: {
        back: "뒤로",
        restart: "다시 시작",
        loadingStory: "이야기를 불러오는 중…",
        you: "당신",
        whatDoYouChoose: "무엇을 선택하시겠습니까?",
        enterANumber: "숫자를 입력하세요...",
        typeYourResponse: "답변을 입력하세요...",
        submit: "제출",
    },
    de: {
        back: "Zurück",
        restart: "Neu starten",
        loadingStory: "Geschichte wird geladen ...",
        you: "Du",
        whatDoYouChoose: "Was wählst du?",
        enterANumber: "Gib eine Zahl ein...",
        typeYourResponse: "Gib deine Antwort ein...",
        submit: "Absenden",
    },
};

/**
 * Maps a raw `env.language`-style tag (e.g. "de", "zh-cn", "pt-br") to one of
 * our supported dictionaries, falling back to "en" for anything unsupported.
 */
export function resolveLocale(raw: string | undefined): Locale {
    const lower = (raw ?? "en").toLowerCase();
    if (lower in dictionaries) return lower as Locale;
    if (lower.startsWith("zh")) return "zh-cn";
    const base = lower.split("-")[0];
    return base in dictionaries ? (base as Locale) : "en";
}

export function t(locale: Locale, key: Key): string {
    return dictionaries[locale]?.[key] ?? dictionaries.en[key];
}
