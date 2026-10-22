// Design Ref: §2.2 등락 원인 초안 ① 연합인포맥스 [채권-마감] 기사 찾기
// Plan 작업 12: 로그인 없이 볼 수 있는 연합인포맥스 웹 기사에서 그날 [채권-마감] 기사를 찾아 본문을 읽는다.
//
// ⚠️ 기사 끝에 "무단전재 및 재배포 금지, AI 학습 및 활용 금지" 문구가 있다. 이 앱은 교육 실습용 테스트라
//    진행하지만, 실제 업무에 쓰기 전에는 이용 약관·계약을 반드시 확인한다. (PRD 7번)
//
// 가져오는 곳은 아래 고정된 주소뿐이다. 기사 번호는 정수만 받아서 주소에 넣는다.
// 기사 글은 믿을 수 없는 바깥 글이므로, 여기서는 글자만 뽑고 길이를 제한한다. (해석·실행하지 않는다)

const HOST = "https://news.einfomax.co.kr";
/** 목록을 몇 쪽까지 볼지(한 쪽 30건). 그날 [채권-마감]은 보통 첫 쪽이나 둘째 쪽에 있다. */
const MAX_LIST_PAGES = 4;

/**
 * 채권/외환 섹션(S1N16)의 그날 기사 목록 주소. 날짜(입력일)로 걸러서 지난 날짜도 찾을 수 있다.
 * 사이트가 요구하는 항목을 모두 채워야 날짜·쪽 번호가 적용된다. 날짜와 쪽 번호는 검사한 값만 넣는다.
 */
export function sectionListUrl(date: string, page: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`날짜가 올바르지 않습니다: ${date}`);
  if (!Number.isInteger(page) || page < 1 || page > 20) throw new Error(`쪽 번호가 올바르지 않습니다: ${page}`);
  return (
    `${HOST}/news/articleList.html?page=${page}&total=0&sc_section_code=S1N16&sc_sub_section_code=&sc_serial_code=` +
    `&sc_area=&sc_level=&sc_article_type=&sc_view_level=&sc_sdate=${date}&sc_edate=${date}&sc_serial_number=` +
    `&sc_word=&box_idxno=&sc_multi_code=&sc_is_image=&sc_is_movie=&sc_user_name=&sc_order_by=E&view_type=sm`
  );
}
const CLOSING_PREFIX = "[채권-마감]";
/** 후보를 몇 건까지 확인할지(최신순). 그날 [채권-마감] 기사는 보통 한 건이다. */
const MAX_CANDIDATES = 5;
/** AI에 넘기는 본문의 최대 글자 수 */
export const MAX_ARTICLE_CHARS = 8000;

export type ArticleListItem = { idxno: number; title: string };

export type Article = {
  idxno: number;
  url: string;
  title: string;
  /** 기사 입력 날짜(한국 시간, YYYY-MM-DD) */
  publishedDate: string;
  /** 본문 글자(태그를 뺀 것) */
  text: string;
};

/** 자주 쓰이는 HTML 글자 코드를 풀어 준다. 그 밖의 코드는 건드리지 않는다. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function articleUrl(idxno: number): string {
  if (!Number.isInteger(idxno) || idxno <= 0 || idxno > 99_999_999) {
    throw new Error(`기사 번호가 올바르지 않습니다: ${idxno}`);
  }
  return `${HOST}/news/articleView.html?idxno=${idxno}`;
}

/**
 * 목록 화면에서 (기사 번호, 제목)을 뽑는다. 그림만 있는 링크는 건너뛴다.
 * 링크가 끝나는 곳(</a>)을 넘어서 다음 링크의 글자를 가져오지 않도록, 링크 안의 태그만 건너뛴다.
 */
export function parseArticleList(html: string): ArticleListItem[] {
  const items = new Map<number, string>();
  for (const match of html.matchAll(
    // 링크 안의 태그만 건너뛴다. </a>를 넘어가면 다음 링크의 글자를 잘못 가져온다(그림만 있는 링크).
    /articleView\.html\?idxno=(\d+)"[^>]*>\s*(?:<(?!\/a>)[^>]*>\s*)*([^<]{4,200})/g,
  )) {
    const title = decodeEntities(match[2]).replace(/\s+/g, " ").trim();
    if (title) items.set(Number(match[1]), title);
  }
  return [...items].map(([idxno, title]) => ({ idxno, title }));
}

/** 제목이 [채권-마감]으로 시작하는 기사만, 번호가 큰(최신) 순서로. */
export function pickClosingCandidates(items: readonly ArticleListItem[]): ArticleListItem[] {
  return items
    .filter((item) => item.title.startsWith(CLOSING_PREFIX))
    .sort((a, b) => b.idxno - a.idxno)
    .slice(0, MAX_CANDIDATES);
}

/** 기사 화면에서 제목·입력 날짜·본문 글자를 뽑는다. 본문 영역을 못 찾으면 null. */
export function parseArticle(idxno: number, html: string): Article | null {
  const title = decodeEntities(
    /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? "",
  ).trim();
  // 입력 시각은 한국 시간(+09:00) 표기에서 날짜 부분만 쓴다.
  const published = /<meta property="article:published_time" content="(\d{4}-\d{2}-\d{2})T[^"]*"/.exec(html)?.[1];
  const body = /<article[^>]*id="article-view-content-div"[^>]*>([\s\S]*?)<\/article>/.exec(html)?.[1];
  if (!title || !published || !body) return null;

  const text = decodeEntities(
    body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    // 줄바꿈과 보통 글자만 남긴다(보이지 않는 제어 글자는 지운다).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_ARTICLE_CHARS);
  if (text.length === 0) return null;

  return { idxno, url: articleUrl(idxno), title, publishedDate: published, text };
}

async function getText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`기사를 받지 못했습니다. (상태 ${response.status})`);
  return response.text();
}

/**
 * 해당 날짜(한국 날짜)의 [채권-마감] 기사를 찾는다. 아직 없으면 null("기사 대기 중").
 * 목록의 최신 후보를 하나씩 열어 입력 날짜가 같은 것을 고른다.
 * 목록에는 최근 기사 약 30건만 있어서, 며칠 지난 날짜는 찾지 못할 수 있다.
 */
export async function findClosingArticle(
  date: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Article | null> {
  const seen = new Set<number>();
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    // 그날(입력일) 채권/외환 섹션 기사 30건씩. 새 기사가 더 없으면 멈춘다.
    const items = parseArticleList(await getText(sectionListUrl(date, page), fetchImpl)).filter(
      (item) => !seen.has(item.idxno),
    );
    if (items.length === 0) break;
    for (const item of items) seen.add(item.idxno);

    for (const candidate of pickClosingCandidates(items)) {
      const article = parseArticle(
        candidate.idxno,
        await getText(articleUrl(candidate.idxno), fetchImpl),
      );
      // 목록이 날짜로 걸러져 있어도, 기사 화면의 입력 날짜로 한 번 더 확인한다.
      if (article && article.publishedDate === date) return article;
    }
  }
  return null;
}

/** 화면에 링크로 보여줘도 되는 기사 주소인가? (https이고 연합인포맥스 기사 주소만. DESIGN §4.5 근거 기사 링크) */
export function isTrustedArticleUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https:\/\/news\.einfomax\.co\.kr\/news\/articleView\.html\?idxno=\d+$/.test(url);
}
