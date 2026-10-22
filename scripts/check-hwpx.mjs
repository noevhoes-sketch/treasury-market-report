// 한글 파일(.hwpx) 만들기 확인: zip 구조, 첫 파일 mimetype, XML 짜임새, 특수문자 처리. (한글 프로그램에서 열어 보는 확인은 사람이 한다)
// 실행: node --experimental-strip-types scripts/check-hwpx.mjs
import { buildHwpx, xmlText } from "../src/lib/hwpx/build.ts";
import { buildReportTable } from "../src/lib/calc/rates-format.ts";

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failed++; };

const rec = (d, i, r) => ({ rate_date: d, instrument: i, rate: r, source: "금융투자협회", as_of_date: d, held: false });
const rows = buildReportTable({
  kr3: { today: rec("2026-10-21", "kr3", 3.822), previousDay: rec("2026-10-20", "kr3", 3.84), previousMonthEnd: null, previousYearEnd: null },
  kr10: { today: null, previousDay: null, previousMonthEnd: null, previousYearEnd: null },
  kr30: { today: null, previousDay: null, previousMonthEnd: null, previousYearEnd: null },
  us10: { today: null, previousDay: null, previousMonthEnd: null, previousYearEnd: null },
});
const bytes = buildHwpx({ date: "2026-10-21", rows, causeKr: "금리 <하락> & \"안도\"", causeUs: "원인 없음", sources: "금융투자협회", basisLines: ["기준일 · 국고채"] });

const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const end = bytes.length - 22;
ok("zip 끝 표식이 있다", view.getUint32(end, true) === 0x06054b50);
const count = view.getUint16(end + 10, true);
let p = view.getUint32(end + 16, true);
const files = new Map();
const decoder = new TextDecoder();
for (let i = 0; i < count; i++) {
  const nameLen = view.getUint16(p + 28, true);
  const off = view.getUint32(p + 42, true);
  const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
  const size = view.getUint32(off + 18, true);
  const start = off + 30 + view.getUint16(off + 26, true);
  files.set(name, { method: view.getUint16(off + 8, true), data: bytes.subarray(start, start + size) });
  p += 46 + nameLen;
}
ok("파일 8개", files.size === 8);
ok("첫 파일이 mimetype이고 압축하지 않았다", [...files.keys()][0] === "mimetype" && files.get("mimetype").method === 0);
ok("mimetype 내용", decoder.decode(files.get("mimetype").data) === "application/hwp+zip");
const section = decoder.decode(files.get("Contents/section0.xml").data);
ok("제목이 들어있다", section.includes("10/21(수) 국채시장 동향"));
ok("금리 3.822와 전일비가 표에 들어있다", section.includes("3.822") && section.includes("-1.8bp"));
ok("못 받은 칸은 미수집", section.includes("미수집"));
ok("특수문자가 안전하게 바뀐다", section.includes("금리 &lt;하락&gt; &amp; &quot;안도&quot;") && !section.includes("<하락>"));
ok("표는 5줄 8칸", section.includes('rowCnt="5" colCnt="8"'));
ok("xmlText 제어문자 제거", xmlText("a\u0001b") === "ab");
for (const [name, f] of files) {
  if (name.endsWith(".xml") || name.endsWith(".hpf")) {
    const text = decoder.decode(f.data);
    ok(`${name}: XML 선언과 닫힘`, text.startsWith("<?xml") && (text.match(/<([a-zA-Z]+:[a-zA-Z]+)[ >]/g) ?? []).length > 0);
  }
}
process.exit(failed ? 1 : 0);
