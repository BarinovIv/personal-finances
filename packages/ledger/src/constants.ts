export const RECURRING_SEEN_PREFIX = "recurringSeen:"
export const CATEGORY_EMOJI_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" })
export const CATEGORY_EMOJI_PATTERN = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*|\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F})$/u
