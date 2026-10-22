// Design Ref: §2.1 ② 국고채 3·10·30년 금리 수집 — 금융투자협회 채권정보센터 최종호가수익률(일자별)
// Plan 작업 6: 금투협 국고채 3·10·30년 수집 + 값 검증
//
// 공식 API는 없다. 채권정보센터 화면이 쓰는 조회 서비스(BISLastAskPrcROPSrchSO.listDay)를 같은 방식으로 부른다.
// 비공식이라 형식이 바뀌거나 막힐 수 있으므로, 응답이 예상과 다르면 조용히 넘어가지 않고 오류를 내거나 "미수집"으로 둔다.
//
// 응답 한 줄의 칸: val1 종류명, val3 오전(11:30), val4 오후(15:30, 최종), val5 전일대비, val6 전일
// 오후 값(val4)이 아직 비어 있으면 아직 공시 전이다. 오전 값으로 대신 채우지 않는다.
// XML은 필요한 칸만 글자로 뽑아 읽고, 엔티티·외부 참조는 해석하지 않는다.

import type { Instrument } from "../db/types";
import { isValidDateString, parseRateText } from "./validate.ts";

export const KOFIA_SOURCE_NAME = "금융투자협회";

/** 화면이 쓰는 조회 서비스 주소. 날짜 말고는 바뀌는 부분이 없는 고정 주소다. */
const KOFIA_SERVICE_URL = "https://www.kofiabond.or.kr/proframeWeb/XMLSERVICES/";

/** 국고채 종류명 → 종목. 이름이 정확히 같은 줄만 받는다. */
const GOVERNMENT_BOND_NAMES: Record<string, Instrument> = {
  "국고채권(3년)": "kr3",
  "국고채권(10년)": "kr10",
  "국고채권(30년)": "kr30",
};

/** 대비 = 오후 - 전일 이 어긋나도 되는 최대 폭(%p). 소수 셋째 자리 반올림 오차만 허용한다. */
const CONSISTENCY_TOLERANCE = 0.0015;

export type KofiaRow = {
  name: string;
  /** 오전 */
  morning: string;
  /** 오후(최종) */
  afternoon: string;
  /** 전일대비 */
  change: string;
  /** 전일 */
  previous: string;
};

export type KofiaYield = {
  instrument: Instrument;
  rate: number;
};

export type KofiaDayStatus =
  /** 그날 자료가 없다 (휴장일이거나 아직 열리지 않은 날) */
  | "no-data"
  /** 자료는 있으나 오후(최종) 값이 아직 없다 (공시 전) */
  | "waiting"
  /** 오후(최종) 값이 있다 */
  | "ok";

export type KofiaDayResult = {
  date: string;
  status: KofiaDayStatus;
  /** 검증을 통과한 국고채 금리 */
  yields: KofiaYield[];
  /** 받았지만 검증에서 걸러 "미수집"으로 둔 종목과 이유 */
  rejected: { instrument: Instrument; reason: string }[];
};

function cell(block: string, field: string): string {
  const match = new RegExp(`<${field}>([^<]*)</${field}>`).exec(block);
  return match ? match[1].trim() : "";
}

/** listDay 응답 XML에서 목록 줄을 뽑는다. 응답 모양이 예상과 다르면 오류를 낸다. */
export function parseKofiaDayXml(xml: string): KofiaRow[] {
  if (!/<pfmFnName>listDay<\/pfmFnName>/.test(xml)) {
    throw new Error("금투협 응답 형식이 달라졌습니다. (listDay 응답이 아님)");
  }
  const list = /<BISComDspDatListDTO>([\s\S]*?)<\/BISComDspDatListDTO>/.exec(xml);
  if (!list) throw new Error("금투협 응답 형식이 달라졌습니다. (목록을 찾지 못함)");

  const total = Number(cell(list[1], "dbio_total_count_"));
  const rows: KofiaRow[] = [];
  for (const match of list[1].matchAll(
    /<BISComDspDatDTO>([\s\S]*?)<\/BISComDspDatDTO>/g,
  )) {
    rows.push({
      name: cell(match[1], "val1"),
      morning: cell(match[1], "val3"),
      afternoon: cell(match[1], "val4"),
      change: cell(match[1], "val5"),
      previous: cell(match[1], "val6"),
    });
  }
  // 알려 준 건수와 읽은 줄 수가 다르면 응답이 잘렸거나 모양이 바뀐 것이다.
  if (Number.isFinite(total) && total !== rows.length) {
    throw new Error(
      `금투협 응답의 줄 수가 맞지 않습니다. (알려 준 ${total}건, 읽은 ${rows.length}건)`,
    );
  }
  return rows;
}

/** 대비(val5)와 전일(val6)이 있으면, 오후 - 전일 = 대비 가 맞는지 확인한다. 칸이 밀렸는지 잡아낸다. */
function isConsistent(row: KofiaRow, afternoon: number): boolean {
  const previous = Number(row.previous);
  const change = Number(row.change);
  if (row.previous === "" || row.change === "") return true;
  if (!Number.isFinite(previous) || !Number.isFinite(change)) return false;
  return Math.abs(afternoon - previous - change) <= CONSISTENCY_TOLERANCE;
}

/** 받은 줄에서 국고채 3·10·30년의 오후(최종) 금리만 골라 검증한다. */
export function selectGovernmentYields(
  date: string,
  rows: readonly KofiaRow[],
): KofiaDayResult {
  if (rows.length === 0) {
    return { date, status: "no-data", yields: [], rejected: [] };
  }

  const yields: KofiaYield[] = [];
  const rejected: KofiaDayResult["rejected"] = [];
  let anyAfternoon = false;

  for (const [name, instrument] of Object.entries(GOVERNMENT_BOND_NAMES)) {
    const matches = rows.filter((row) => row.name === name);
    if (matches.length !== 1) {
      rejected.push({
        instrument: instrument as Instrument,
        reason: matches.length === 0 ? "해당 종류 줄이 없음" : "같은 종류 줄이 여러 개",
      });
      continue;
    }
    const row = matches[0];
    if (row.afternoon === "") continue; // 아직 공시 전
    anyAfternoon = true;
    const rate = parseRateText(row.afternoon);
    if (rate === null) {
      rejected.push({ instrument: instrument as Instrument, reason: "금리 형식 오류" });
    } else if (!isConsistent(row, rate)) {
      rejected.push({ instrument: instrument as Instrument, reason: "전일대비와 맞지 않음" });
    } else {
      yields.push({ instrument: instrument as Instrument, rate });
    }
  }

  return {
    date,
    status: anyAfternoon || yields.length > 0 ? "ok" : "waiting",
    yields,
    rejected,
  };
}

/** 요청 본문. 날짜는 검증을 통과한 "YYYY-MM-DD"만 "YYYYMMDD"로 바꿔 넣는다. */
function buildDayRequest(date: string): string {
  if (!isValidDateString(date)) throw new Error(`날짜가 올바르지 않습니다: ${date}`);
  const compact = date.replaceAll("-", "");
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n<message>\n  <proframeHeader>\n' +
    "    <pfmAppName>BIS-KOFIABOND</pfmAppName>\n" +
    "    <pfmSvcName>BISLastAskPrcROPSrchSO</pfmSvcName>\n" +
    "    <pfmFnName>listDay</pfmFnName>\n" +
    "  </proframeHeader>\n  <systemHeader></systemHeader>\n" +
    `<BISComDspDatDTO><val1>${compact}</val1></BISComDspDatDTO>\n</message>\n`
  );
}

/** 하루치 최종호가수익률을 받아 국고채 3·10·30년만 검증해서 돌려준다. */
export async function fetchKofiaDay(
  date: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KofiaDayResult> {
  const response = await fetchImpl(KOFIA_SERVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "User-Agent": "Mozilla/5.0",
    },
    body: buildDayRequest(date),
    cache: "no-store",
    // 서버가 응답하지 않을 때 오래 붙잡히지 않는다.
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`금투협 자료를 받지 못했습니다. (상태 ${response.status})`);
  }
  return selectGovernmentYields(date, parseKofiaDayXml(await response.text()));
}
