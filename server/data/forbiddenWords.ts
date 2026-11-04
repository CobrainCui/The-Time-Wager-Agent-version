/**
 * 私信 / 转账备注起点词表（可继续追加）。中文 ≥2 字；英文为完整词，避免过短误伤。
 */
export const FORBIDDEN_WORDS_ZH: readonly string[] = [
  // 辱骂
  "傻逼",
  "傻B",
  "煞笔",
  "草泥马",
  "操你妈",
  "去死",
  "贱人",
  "人渣",
  "废物",
  "滚蛋",
  "妈的",
  "他妈",
  "你妹",
  "脑残",
  "智障",
  "婊子",
  "狗屎",
  // 色情
  "色情",
  "淫秽",
  "做爱",
  "性交",
  "口交",
  "约炮",
  "裸聊",
  "黄片",
  "AV片",
  // 暴力威胁
  "杀你",
  "弄死你",
  "砍死",
  "炸掉",
  // 诈骗引流
  "加微信",
  "加VX",
  "私聊转账",
  "刷单返利",
  "稳赚不赔",
  "点击链接",
  "免费领取",
];

export const FORBIDDEN_WORDS_EN: readonly string[] = [
  // profanity
  "fuck",
  "fucking",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "pussy",
  "cunt",
  "whore",
  "slut",
  // sexual
  "porn",
  "porno",
  "nude",
  "nudes",
  "sexvideo",
  // violence
  "kill you",
  "killyou",
  // scam
  "click here",
  "free money",
  "wire transfer",
  "send bitcoin",
];

export const FORBIDDEN_WORDS = {
  zh: FORBIDDEN_WORDS_ZH,
  en: FORBIDDEN_WORDS_EN,
} as const;
