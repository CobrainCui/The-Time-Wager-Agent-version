import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  maskForbiddenText,
  normalizeNoteInput,
  sanitizeTransactionNote,
  type ForbiddenWordList,
} from "./forbiddenText.js";

const TEST_LIST: ForbiddenWordList = {
  zh: ["坏词", "更长坏词"],
  en: ["badword", "ass"],
};

describe("forbiddenText", () => {
  it("masks Chinese substring", () => {
    assert.equal(maskForbiddenText("前缀坏词后缀", TEST_LIST), "前缀**后缀");
  });

  it("masks English whole word", () => {
    assert.equal(maskForbiddenText("say badword here", TEST_LIST), "say ******* here");
  });

  it("masks mixed Chinese and English in one note", () => {
    assert.equal(maskForbiddenText("坏词 plus badword", TEST_LIST), "** plus *******");
  });

  it("folds English case and fullwidth letters", () => {
    assert.equal(maskForbiddenText("ＢＡＤＷＯＲＤ", TEST_LIST), "*******");
  });

  it("matches English with ignorable separators between letters", () => {
    assert.equal(maskForbiddenText("b a d w o r d", TEST_LIST), "*************");
  });

  it("matches Chinese with spaces between characters", () => {
    assert.equal(maskForbiddenText("更 长 坏 词", TEST_LIST), "*******");
  });

  it("strips zero-width characters for matching", () => {
    assert.equal(maskForbiddenText("坏\u200b词", TEST_LIST), "***");
  });

  it("does not mask English substring inside another word", () => {
    assert.equal(maskForbiddenText("classroom", TEST_LIST), "classroom");
  });

  it("prefers longest Chinese match from the left", () => {
    assert.equal(maskForbiddenText("更长坏词呀", TEST_LIST), "****呀");
  });

  it("unions overlapping Chinese and English spans in one note", () => {
    const list: ForbiddenWordList = { zh: ["12badw34"], en: ["badw"] };
    assert.equal(maskForbiddenText("12badw34", list), "********");
  });

  it("masks using code point indices when emoji precedes English hit", () => {
    const list: ForbiddenWordList = { zh: [], en: ["badword"] };
    assert.equal(maskForbiddenText("😀badword", list), "😀*******");
  });

  it("leaves clean text unchanged", () => {
    assert.equal(maskForbiddenText("正常交流内容 hello", TEST_LIST), "正常交流内容 hello");
  });

  it("normalizeNoteInput trims and caps length", () => {
    assert.equal(normalizeNoteInput("  hi  "), "hi");
    assert.equal(normalizeNoteInput("x".repeat(600)).length, 500);
    assert.equal(normalizeNoteInput(null), "");
  });

  it("sanitizeTransactionNote trims then masks", () => {
    assert.equal(sanitizeTransactionNote("  badword  ", TEST_LIST), "*******");
  });

  it("empty note stays empty", () => {
    assert.equal(maskForbiddenText("", TEST_LIST), "");
    assert.equal(sanitizeTransactionNote("   ", TEST_LIST), "");
  });
});
