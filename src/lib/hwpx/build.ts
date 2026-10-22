// Design Ref: §1.2 보고서 화면, §2.4 한글 파일 — 확정된 보고서를 새 양식의 .hwpx(한글 문서)로 만든다
// Plan 작업 15: 제목, 금리 표(출처 값 그대로), 등락 원인 두 줄, 출처·기준일. 새 패키지 없이 zip을 직접 묶는다.
// 한글 프로그램으로 열어 보는 확인은 사람이 해야 한다(자동 확인은 구조·내용까지만 한다).

import { reportTitle } from "../calc/business-days.ts";
import type { TableRow } from "../calc/rates-format.ts";
import { buildZip } from "./zip.ts";

const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" ' +
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"';

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

const HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head ${NS} version="1.4" secCnt="1">
<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
<hh:refList>
<hh:fontfaces itemCnt="1"><hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"/></hh:fontface></hh:fontfaces>
<hh:borderFills itemCnt="2">
<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>
<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>
</hh:borderFills>
<hh:charProperties itemCnt="3">
<hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/></hh:charPr>
<hh:charPr id="1" height="1800" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/></hh:charPr>
<hh:charPr id="2" height="900" textColor="#555555" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/></hh:charPr>
</hh:charProperties>
<hh:paraProperties itemCnt="2">
<hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="LEFT" vertical="BASELINE"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:paraPr>
<hh:paraPr id="1" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="CENTER" vertical="CENTER"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hh:paraPr>
</hh:paraProperties>
<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>
</hh:refList>
</hh:head>`;

function paragraph(text: string, charPr = 0, paraPr = 0): string {
  return `<hp:p id="0" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPr}"><hp:t>${xmlText(text)}</hp:t></hp:run></hp:p>`;
}

const COL_WIDTHS = [6000, 5217, 5217, 5217, 5217, 5217, 5217, 5217];
const ROW_HEIGHT = 2200;

function cell(text: string, col: number, row: number): string {
  return (
    `<hp:tc name="" header="${row === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    paragraph(text, 0, 1) +
    `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
    `<hp:cellSz width="${COL_WIDTHS[col]}" height="${ROW_HEIGHT}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
  );
}

function table(rows: readonly TableRow[]): string {
  const header = ["구분", "전년말", "전월말", "전일", "금일", "전년말비", "전월말비", "전일비"];
  const body = rows.map((row) => [
    LABELS[row.instrument],
    row.previousYearEnd.text,
    row.previousMonthEnd.text,
    row.previousDay.text,
    row.today.text,
    row.changeFromYearEnd.text,
    row.changeFromMonthEnd.text,
    row.changeFromPreviousDay.text,
  ]);
  const all = [header, ...body];
  const trs = all
    .map((line, r) => `<hp:tr>${line.map((text, c) => cell(text, c, r)).join("")}</hp:tr>`)
    .join("");
  const width = COL_WIDTHS.reduce((a, b) => a + b, 0);
  return (
    `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">` +
    `<hp:tbl id="1" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${all.length}" colCnt="8" cellSpacing="0" borderFillIDRef="2" noAdjust="0">` +
    `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${ROW_HEIGHT * all.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
    trs +
    `</hp:tbl></hp:run></hp:p>`
  );
}

const SEC_PR =
  `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">` +
  `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
  `<hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr>` +
  `</hp:secPr></hp:run></hp:p>`;

function section(input: HwpxInput): string {
  const body = [
    paragraph(reportTitle(input.date), 1),
    paragraph(""),
    table(input.rows),
    paragraph(""),
    paragraph("등락 원인"),
    paragraph(`□ 국고채: ${input.causeKr}`),
    paragraph(`□ 미국 금리: ${input.causeUs}`),
    paragraph(""),
    paragraph(`출처: ${input.sources}`, 2),
    ...input.basisLines.map((line) => paragraph(line, 2)),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hs:sec ${NS}>${SEC_PR}${body}</hs:sec>`;
}

const VERSION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="0" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="12.0.0"/>';

const CONTAINER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>';

const MANIFEST =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>';

const SETTINGS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>';

function contentHpf(title: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id="">' +
    `<opf:metadata><opf:title>${xmlText(title)}</opf:title><opf:language>ko</opf:language></opf:metadata>` +
    '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
    '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>' +
    "</opf:package>"
  );
}

/** 확정된 보고서를 .hwpx 파일 내용(바이트)으로 만든다. */
export function buildHwpx(input: HwpxInput): Uint8Array {
  return buildZip([
    { name: "mimetype", data: "application/hwp+zip" },
    { name: "version.xml", data: VERSION },
    { name: "settings.xml", data: SETTINGS },
    { name: "META-INF/container.xml", data: CONTAINER },
    { name: "META-INF/manifest.xml", data: MANIFEST },
    { name: "Contents/content.hpf", data: contentHpf(reportTitle(input.date)) },
    { name: "Contents/header.xml", data: HEAD },
    { name: "Contents/section0.xml", data: section(input) },
  ]);
}
