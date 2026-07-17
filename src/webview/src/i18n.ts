export type Locale = "en" | "it" | "ru" | "zh-cn" | "ja" | "es" | "fr" | "ko" | "de";

type Key =
    | "back"
    | "restart"
    | "loadingStory"
    | "errorRunningStory"
    | "lineNumber"
    | "whatDoYouChoose"
    | "enterANumber"
    | "typeYourResponse"
    | "submit"
    | "continue"
    | "narrativePause"
    | "youChose"
    | "youAnswered"
    | "nonInkLabelCall"
    | "nonInkLabelJump";

const dictionaries: Record<Locale, Record<Key, string>> = {
    en: {
        back: "Back",
        restart: "Restart",
        loadingStory: "Loading story...",
        errorRunningStory: "An error occurred while running the story",
        lineNumber: "Line {0}",
        whatDoYouChoose: "What do you choose?",
        enterANumber: "Enter a number...",
        typeYourResponse: "Type your response...",
        submit: "Submit",
        continue: "Continue",
        narrativePause: "(Narrative pause)",
        youChose: "(You chose: {0})",
        youAnswered: "(You answered: {0})",
        nonInkLabelCall: "(calling a label not defined in ink: {0})",
        nonInkLabelJump: "(jumping to a label not defined in ink: {0})",
    },
    it: {
        back: "Indietro",
        restart: "Ricomincia",
        loadingStory: "Caricamento della storia...",
        errorRunningStory: "Si è verificato un errore durante l'esecuzione della storia",
        lineNumber: "Riga {0}",
        whatDoYouChoose: "Cosa scegli?",
        enterANumber: "Inserisci un numero...",
        typeYourResponse: "Scrivi la tua risposta...",
        submit: "Invia",
        continue: "Continua",
        narrativePause: "(Pausa narrativa)",
        youChose: "(Hai scelto: {0})",
        youAnswered: "(Il tuo input è stato: {0})",
        nonInkLabelCall: "(chiamata a una label non definita in ink: {0})",
        nonInkLabelJump: "(salto a una label non definita in ink: {0})",
    },
    ru: {
        back: "Назад",
        restart: "Заново",
        loadingStory: "Загрузка истории...",
        errorRunningStory: "Произошла ошибка при выполнении истории",
        lineNumber: "Строка {0}",
        whatDoYouChoose: "Что вы выбираете?",
        enterANumber: "Введите число...",
        typeYourResponse: "Введите ваш ответ...",
        submit: "Отправить",
        continue: "Продолжить",
        narrativePause: "(Пауза в повествовании)",
        youChose: "(Вы выбрали: {0})",
        youAnswered: "(Вы ответили: {0})",
        nonInkLabelCall: "(вызов метки, не определённой в ink: {0})",
        nonInkLabelJump: "(переход к метке, не определённой в ink: {0})",
    },
    "zh-cn": {
        back: "返回",
        restart: "重新开始",
        loadingStory: "正在加载故事…",
        errorRunningStory: "运行故事时发生错误",
        lineNumber: "第 {0} 行",
        whatDoYouChoose: "你选择什么?",
        enterANumber: "输入一个数字…",
        typeYourResponse: "输入你的回复…",
        submit: "提交",
        continue: "继续",
        narrativePause: "(叙事暂停)",
        youChose: "(你选择了：{0})",
        youAnswered: "(你的输入是：{0})",
        nonInkLabelCall: "(调用一个未在 ink 中定义的 label：{0})",
        nonInkLabelJump: "(跳转到一个未在 ink 中定义的 label：{0})",
    },
    ja: {
        back: "戻る",
        restart: "最初から",
        loadingStory: "物語を読み込み中…",
        errorRunningStory: "物語の実行中にエラーが発生しました",
        lineNumber: "{0} 行目",
        whatDoYouChoose: "どちらを選びますか?",
        enterANumber: "数字を入力してください…",
        typeYourResponse: "返答を入力してください…",
        submit: "送信",
        continue: "続ける",
        narrativePause: "(物語の一時停止)",
        youChose: "(選んだ内容: {0})",
        youAnswered: "(あなたの回答: {0})",
        nonInkLabelCall: "(inkで定義されていないラベルを呼び出し中: {0})",
        nonInkLabelJump: "(inkで定義されていないラベルへジャンプ中: {0})",
    },
    es: {
        back: "Atrás",
        restart: "Reiniciar",
        loadingStory: "Cargando historia...",
        errorRunningStory: "Se produjo un error al ejecutar la historia",
        lineNumber: "Línea {0}",
        whatDoYouChoose: "¿Qué eliges?",
        enterANumber: "Introduce un número...",
        typeYourResponse: "Escribe tu respuesta...",
        submit: "Enviar",
        continue: "Continuar",
        narrativePause: "(Pausa narrativa)",
        youChose: "(Has elegido: {0})",
        youAnswered: "(Tu respuesta fue: {0})",
        nonInkLabelCall: "(llamando a una etiqueta no definida en ink: {0})",
        nonInkLabelJump: "(saltando a una etiqueta no definida en ink: {0})",
    },
    fr: {
        back: "Retour",
        restart: "Recommencer",
        loadingStory: "Chargement de l'histoire...",
        errorRunningStory: "Une erreur s'est produite lors de l'exécution de l'histoire",
        lineNumber: "Ligne {0}",
        whatDoYouChoose: "Que choisissez-vous ?",
        enterANumber: "Entrez un nombre...",
        typeYourResponse: "Saisissez votre réponse...",
        submit: "Envoyer",
        continue: "Continuer",
        narrativePause: "(Pause narrative)",
        youChose: "(Vous avez choisi : {0})",
        youAnswered: "(Votre réponse était : {0})",
        nonInkLabelCall: "(appel d'un label non défini dans ink : {0})",
        nonInkLabelJump: "(saut vers un label non défini dans ink : {0})",
    },
    ko: {
        back: "뒤로",
        restart: "다시 시작",
        loadingStory: "이야기를 불러오는 중…",
        errorRunningStory: "이야기를 실행하는 중 오류가 발생했습니다",
        lineNumber: "{0}번째 줄",
        whatDoYouChoose: "무엇을 선택하시겠습니까?",
        enterANumber: "숫자를 입력하세요...",
        typeYourResponse: "답변을 입력하세요...",
        submit: "제출",
        continue: "계속",
        narrativePause: "(내러티브 일시정지)",
        youChose: "(선택함: {0})",
        youAnswered: "(입력한 답변: {0})",
        nonInkLabelCall: "(ink에 정의되지 않은 라벨 호출 중: {0})",
        nonInkLabelJump: "(ink에 정의되지 않은 라벨로 이동 중: {0})",
    },
    de: {
        back: "Zurück",
        restart: "Neu starten",
        loadingStory: "Geschichte wird geladen ...",
        errorRunningStory: "Beim Ausführen der Geschichte ist ein Fehler aufgetreten",
        lineNumber: "Zeile {0}",
        whatDoYouChoose: "Was wählst du?",
        enterANumber: "Gib eine Zahl ein...",
        typeYourResponse: "Gib deine Antwort ein...",
        submit: "Absenden",
        continue: "Weiter",
        narrativePause: "(Erzählpause)",
        youChose: "(Du hast gewählt: {0})",
        youAnswered: "(Deine Antwort war: {0})",
        nonInkLabelCall: "(Aufruf eines nicht in ink definierten Labels: {0})",
        nonInkLabelJump: "(Sprung zu einem nicht in ink definierten Label: {0})",
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

export function t(locale: Locale, key: Key, ...args: (string | number)[]): string {
    const template = dictionaries[locale]?.[key] ?? dictionaries.en[key];
    return args.reduce((str: string, arg, i) => str.replace(`{${i}}`, String(arg)), template);
}
