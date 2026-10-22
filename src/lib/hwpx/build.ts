// Design Ref: §1.2 보고서 화면, §2.4 한글 파일 — 확정된 보고서를 새 양식의 .hwpx(한글 문서)로 만든다
// Plan 작업 15: 제목, 금리 표(출처 값 그대로), 등락 원인 두 줄, 출처·기준일. 새 패키지 없이 zip을 직접 묶는다.
// 한글 프로그램으로 열어 보는 확인은 사람이 해야 한다(자동 확인은 구조·내용까지만 한다).

import { reportTitle } from "../calc/business-days.ts";
import type { TableRow } from "../calc/rates-format.ts";
import { buildZip } from "./zip.ts";
import { HEADER_XML, SEC_OPEN, SEC_PR_RUN, PACKAGE_OPEN, VERSION_XML, CONTAINER_XML, MANIFEST_XML, SETTINGS_XML } from "./template.ts";

const LABELS: Record<TableRow["instrument"], string> = {
  kr3: "국고 3년",
  kr10: "국고 10년",
  kr30: "국고 30년",
  us10: "미국 10년",
};

/** XML에 넣을 글자를 안전하게: 특수문자는 바꾸고, 제어문자는 뺀다. */
export function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type HwpxInput = {
  date: string;
  rows: readonly TableRow[];
  causeKr: string;
  causeUs: string;
  /** 표에 쓰인 출처 이름들 */
  sources: string;
  /** 열별 기준일 안내 한 줄씩 */
  basisLines: readonly string[];
};

// 정부 공문 보고서 양식(A4 한 장): 맨 위 부서, 위아래 굵은 선 제목 상자, □ 소제목, 회색 머리글 표, ○ 항목, ※ 출처, 맨 아래 기관명.
// 글자 모양(template.ts의 header 기준): 0 보통 8 본문14 9 소제목16굵게 10 제목26굵게 11 표12 12 표12굵게 13 출처11 14 기관명22굵게 15 13pt
// 문단: 0 양쪽 맞춤, 20 가운데, 21 제목 상자, 22 오른쪽, 23 ○ 항목(내어쓰기), 24 □ 소제목, 25 맨 아래 기관명
const BODY_WIDTH = 48190;

/** 한글이 문단마다 갖고 있는 줄 정보. 값은 열 때 한글이 다시 계산하므로 대략적인 값이면 된다. */
function lineSeg(width = BODY_WIDTH): string {
  return `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>`;
}

function paragraph(text: string, charPr = 0, paraPr = 0, width = BODY_WIDTH): string {
  const run = text === "" ? `<hp:run charPrIDRef="${charPr}"/>` : `<hp:run charPrIDRef="${charPr}"><hp:t>${xmlText(text)}</hp:t></hp:run>`;
  return `<hp:p id="0" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${run}${lineSeg(width)}</hp:p>`;
}

// 표: 구분 칸을 넓게, 나머지 7칸은 같게 (합 48190)
const COL_WIDTHS = [6890, 5900, 5900, 5900, 5900, 5900, 5900, 5900];
const HEAD_HEIGHT = 3600;
const ROW_HEIGHT = 4600;
// 눈에 띄게 할 열: 금일(4), 전일비(5)
const EMPHASIS_COLS = [4, 5];

function cell(text: string, col: number, row: number): string {
  const width = COL_WIDTHS[col];
  const head = row === 0;
  const strong = head || col === 0 || EMPHASIS_COLS.includes(col);
  // 머리글·구분 칸은 연한 회색, 금일·전일비 머리글은 진한 회색
  const fill = head ? (EMPHASIS_COLS.includes(col) ? 5 : 4) : col === 0 ? 4 : 3;
  return (
    `<hp:tc name="" header="${head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${fill}">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    paragraph(text, strong ? 12 : 11, 20, width - 600) +
    `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
    `<hp:cellSz width="${width}" height="${head ? HEAD_HEIGHT : ROW_HEIGHT}"/><hp:cellMargin left="300" right="300" top="141" bottom="141"/></hp:tc>`
  );
}

function table(rows: readonly TableRow[]): string {
  const header = ["구분", "전년말", "전월말", "전일", "금일", "전일비", "전월말비", "전년말비"];
  const body = rows.map((row) => [
    LABELS[row.instrument],
    row.previousYearEnd.text,
    row.previousMonthEnd.text,
    row.previousDay.text,
    row.today.text,
    row.changeFromPreviousDay.text,
    row.changeFromMonthEnd.text,
    row.changeFromYearEnd.text,
  ]);
  const all = [header, ...body];
  const trs = all.map((line, r) => `<hp:tr>${line.map((text, c) => cell(text, c, r)).join("")}</hp:tr>`).join("");
  return (
    `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">` +
    `<hp:tbl id="1000001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${all.length}" colCnt="8" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${BODY_WIDTH}" widthRelTo="ABSOLUTE" height="${HEAD_HEIGHT + ROW_HEIGHT * rows.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="283" bottom="283"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>` +
    trs +
    `</hp:tbl><hp:t/></hp:run>${lineSeg(0)}</hp:p>`
  );
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-21" → "2026. 10. 21.(수)" (공문서 날짜 표기) */
export function officialDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}. ${m}. ${d}.(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

function section(input: HwpxInput): string {
  // 첫 문단에 쪽 설정(secPr)을 싣는다. 한글 문서는 항상 그렇게 시작한다.
  const first = `<hp:p id="0" paraPrIDRef="22" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${SEC_PR_RUN}<hp:run charPrIDRef="15"><hp:t>재정경제부 국고실</hp:t></hp:run>${lineSeg()}</hp:p>`;
  const body = [
    first,
    paragraph(reportTitle(input.date), 10, 21),
    paragraph("□ 금리 현황", 9, 24),
    paragraph("(단위: %, bp)", 13, 22),
    table(input.rows),
    paragraph("□ 등락 원인", 9, 24),
    paragraph(`○ 국고채: ${input.causeKr}`, 8, 23),
    paragraph(`○ 미국 금리: ${input.causeUs}`, 8, 23),
    paragraph(`※ 출처: ${input.sources}`, 13, 0),
    ...input.basisLines.map((line) => paragraph(`※ ${line}`, 13, 0)),
    paragraph(officialDate(input.date), 15, 25),
    paragraph("재정경제부 국고실", 14, 20),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>${SEC_OPEN}${body}</hs:sec>`;
}

function contentHpf(title: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
    PACKAGE_OPEN +
    `<opf:metadata><opf:title>${xmlText(title)}</opf:title><opf:language>ko</opf:language></opf:metadata>` +
    '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
    '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>'
  );
}

/** 확정된 보고서를 .hwpx 파일 내용(바이트)으로 만든다. 파일 순서·이름은 한글이 만든 문서와 같게 맞췄다. */
export function buildHwpx(input: HwpxInput): Uint8Array {
  return buildZip([
    { name: "mimetype", data: "application/hwp+zip" },
    { name: "version.xml", data: VERSION_XML },
    { name: "Contents/header.xml", data: HEADER_XML },
    { name: "Contents/section0.xml", data: section(input) },
    { name: "settings.xml", data: SETTINGS_XML },
    { name: "Contents/content.hpf", data: contentHpf(reportTitle(input.date)) },
    { name: "META-INF/container.xml", data: CONTAINER_XML },
    { name: "META-INF/manifest.xml", data: MANIFEST_XML },
  ]);
}
