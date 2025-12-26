// client/src/services/newsService.js
import axios from "axios";

const GPT_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

// ✅ .env로 서버 주소 분리
// - CRA proxy 쓰면: REACT_APP_API_BASE_URL="" (또는 미설정) + package.json proxy 사용
// - proxy 안 쓰면: REACT_APP_API_BASE_URL="http://localhost:5000"
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");

// ---------------- utils ----------------
const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const stripHtml = (s) =>
  String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const safeSlice = (s, maxLen) => {
  const str = String(s || "");
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
};

const dedupeStrings = (arr) => {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const v = String(x || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

// GPT가 잡문 섞어도 JSON만 뽑아 파싱
const tryExtractJsonObject = (raw) => {
  let s = String(raw || "").trim();
  if (!s) return null;

  s = s.replace(/```json/gi, "").replace(/```/g, "").trim();

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  return s.slice(start, end + 1);
};

const tryParseJsonObject = (raw) => {
  const extracted = tryExtractJsonObject(raw);
  if (!extracted) return null;

  const repaired = extracted
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
};

const normalizeKeywords = (kw) => {
  if (Array.isArray(kw)) return kw.map(stripHtml).filter(Boolean);
  if (!kw) return [];
  return [stripHtml(kw)].filter(Boolean);
};

const localRelevanceScore = (item, keyword, category) => {
  // GPT가 없거나 점수가 없을 때를 위한 최소한의 휴먼-레벨 스코어링
  const text = `${item?.title || ""} ${item?.summary || ""} ${(item?.keywords || []).join(" ")}`.toLowerCase();
  const k = String(keyword || "").toLowerCase();
  const c = String(category || "").toLowerCase();

  let score = 0;
  if (k && text.includes(k)) score += 50;
  if (c && text.includes(c)) score += 40;

  // 키워드 배열에 카테고리/키워드가 있으면 추가점
  const kws = (item?.keywords || []).map((x) => String(x).toLowerCase());
  if (k && kws.some((x) => x.includes(k))) score += 10;
  if (c && kws.some((x) => x.includes(c))) score += 10;

  return Math.max(0, Math.min(100, score));
};

const fallbackItemFromRaw = (raw, keyword, category) => {
  const item = {
    title: safeSlice(stripHtml(raw?.title), 120),
    summary:
      safeSlice(stripHtml(raw?.summary || ""), 260) ||
      safeSlice(stripHtml(raw?.title), 260),
    source: raw?.source || "",
    date: raw?.pubDate || raw?.date || "",
    keywords: [],
    relevanceScore: null,
  };
  item.relevanceScore = localRelevanceScore(item, keyword, category);
  return item;
};

const sortNewsByRelevanceThenDate = (news) => {
  // relevanceScore DESC, date DESC (가능한 경우)
  return [...(news || [])].sort((a, b) => {
    const sa = Number.isFinite(Number(a?.relevanceScore)) ? Number(a.relevanceScore) : -1;
    const sb = Number.isFinite(Number(b?.relevanceScore)) ? Number(b.relevanceScore) : -1;

    if (sb !== sa) return sb - sa;

    const da = a?.date ? new Date(a.date).getTime() : 0;
    const db = b?.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
};

// ---------------- 1) NAVER ----------------
export const fetchNaverNews = async (keyword, category, limit) => {
  const safeLimit = clampInt(limit, 1, 100, 10);
  const query = String(keyword || "").trim();
  if (!query) return [];

  try {
    const url = `${API_BASE_URL}/api/news`; // API_BASE_URL 비어있으면 "/api/news"
    const response = await axios.get(url, {
      params: { query, display: safeLimit, sort: "date" },
    });

    const data = Array.isArray(response.data) ? response.data : [];
    return data.map((n) => ({
      title: stripHtml(n?.title),
      summary: stripHtml(n?.summary),
      source: n?.source || "",
      pubDate: n?.pubDate || "",
    }));
  } catch (error) {
    console.error("네이버 뉴스 가져오기 실패:", error);
    return [];
  }
};

// ---------------- 2) GPT (10개씩) ----------------
const summarizeChunkWithGPT = async (chunk, keyword, category, chunkIndex) => {
  if (!Array.isArray(chunk) || chunk.length === 0) {
    return { talking: [], news: [] };
  }

  // 키 없으면 raw fallback(점수는 로컬 계산)
  if (!OPENAI_API_KEY) {
    return {
      talking: [],
      news: chunk.map((x) => fallbackItemFromRaw(x, keyword, category)),
    };
  }

  // 입력 축약(토큰 폭발 방지)
  const compact = chunk.map((n, i) => ({
    id: chunkIndex * 10 + i + 1,
    title: safeSlice(stripHtml(n?.title), 140),
    summary: safeSlice(stripHtml(n?.summary), 320),
    source: n?.source || "",
    pubDate: n?.pubDate || "",
  }));

  const size = compact.length;

  // ✅ "논의 아이디어"는 청크마다 3~6개 뽑아오고, 최종에서 전부 합침
  // ✅ 관련도는 GPT가 relevanceScore(0~100)로 산정
  // 기준을 명시적으로 적어줌 (카테고리/키워드/뉴스 중심성/낚시성 감점)
  const prompt = `
너는 "오직 JSON"만 출력하는 엔진이다. 다른 텍스트/마크다운/설명 금지.

키워드: "${String(keyword || "").trim()}"
카테고리(중점 키워드): "${String(category || "").trim()}"

작업 1) 아래 뉴스 ${size}개를 각각 한국어로 요약하라.
- news 배열 길이는 반드시 ${size}로 맞추고 입력 순서를 유지하라.
- date는 입력 pubDate 그대로 넣어라.
- source는 입력 source 그대로 넣어라.
- keywords는 3~6개.

작업 2) 각 뉴스마다 관련도 점수 relevanceScore(0~100)를 매겨라.
점수 기준(가중치 포함):
- 카테고리와 직접적으로 같은 주제/이슈: +50
- 키워드와 직접적으로 같은 주제/이슈: +30
- 제목/요약/키워드에 카테고리 핵심 용어 포함: +0~20
- 기사 핵심이 주변 이슈/잡담/광고/낚시성: -0~30
- 점수는 반드시 0~100 사이 정수로 출력.

작업 3) 이 청크 뉴스들을 바탕으로 "논의 아이디어(talking)"를 3~6개 제시하라.
- 뉴스레터 독자가 흥미로워할만한 관점/질문/후속 취재거리 형태.

출력 스키마(반드시 준수):
{
  "talking": string[],
  "news": [
    { "title": string, "summary": string, "source": string, "date": string, "keywords": string[], "relevanceScore": number }
  ]
}

입력 뉴스:
${JSON.stringify(compact)}
`.trim();

  try {
    const response = await axios.post(
      GPT_API_URL,
      {
        model: "gpt-4o",
        temperature: 0.2,
        max_tokens: 2600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Output ONLY valid JSON object." },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const raw = response?.data?.choices?.[0]?.message?.content || "";
    const parsed = tryParseJsonObject(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const talking = Array.isArray(parsed.talking) ? parsed.talking : [];
    const news = Array.isArray(parsed.news) ? parsed.news : [];

    const normalized = news.map((x, i) => {
      const title = safeSlice(stripHtml(x?.title ?? chunk[i]?.title), 120);
      const summary = safeSlice(stripHtml(x?.summary ?? chunk[i]?.summary), 260);
      const source = x?.source || chunk[i]?.source || "";
      const date = x?.date || chunk[i]?.pubDate || "";
      const keywords = normalizeKeywords(x?.keywords);
      const relevanceScore = clampInt(x?.relevanceScore, 0, 100, localRelevanceScore({ title, summary, keywords }, keyword, category));

      return { title, summary, source, date, keywords, relevanceScore };
    });

    return {
      talking: talking.map(stripHtml).filter(Boolean),
      news: normalized,
    };
  } catch (e) {
    console.error("GPT 요약 실패:", e);
    return null;
  }
};

// ---------------- 2-1) 전체 talking 정리(옵션) ----------------
const refineTalkingWithGPT = async (talkingList, keyword, category) => {
  const ideas = dedupeStrings(talkingList).slice(0, 40);
  if (!OPENAI_API_KEY || ideas.length <= 10) return ideas.slice(0, 10);

  const prompt = `
오직 JSON만 출력. 설명 금지.

키워드: "${String(keyword || "").trim()}"
카테고리: "${String(category || "").trim()}"

아래 아이디어 리스트를 중복 제거/문장 다듬기 후,
뉴스레터용 "논의 아이디어" 10개 이내로 정리해라.
너무 비슷한 건 합치고, 명확한 문장으로 바꿔라.

출력 스키마:
{ "talking": string[] }

입력:
${JSON.stringify(ideas)}
`.trim();

  try {
    const res = await axios.post(
      GPT_API_URL,
      {
        model: "gpt-4o",
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Output ONLY valid JSON object." },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const raw = res?.data?.choices?.[0]?.message?.content || "";
    const parsed = tryParseJsonObject(raw);
    const out = Array.isArray(parsed?.talking) ? parsed.talking : ideas;
    return dedupeStrings(out).slice(0, 10);
  } catch {
    return ideas.slice(0, 10);
  }
};

// ---------------- 2-2) 전체 뉴스 재정렬(옵션) ----------------
const rerankAllNewsWithGPT = async (news, keyword, category) => {
  if (!OPENAI_API_KEY || !Array.isArray(news) || news.length <= 1) return null;

  // 입력 축약
  const compact = news.map((n, idx) => ({
    idx,
    title: safeSlice(stripHtml(n?.title), 140),
    summary: safeSlice(stripHtml(n?.summary), 220),
    keywords: Array.isArray(n?.keywords) ? n.keywords.slice(0, 8) : [],
    date: n?.date || "",
    source: n?.source || "",
    relevanceScore: Number.isFinite(Number(n?.relevanceScore)) ? Number(n.relevanceScore) : null,
  }));

  const prompt = `
오직 JSON만 출력. 설명/마크다운 금지.

키워드: "${String(keyword || "").trim()}"
카테고리: "${String(category || "").trim()}"

아래 news 목록을 "관련도 높은 순"으로 정렬해라.
정렬 기준(우선순위):
1) 카테고리와 직접 관련 (가장 중요)
2) 키워드와 직접 관련
3) 기사 중심성(핵심 이슈인지, 주변 이슈인지)
4) 낚시/광고/의미없는 내용은 뒤로
동점이면 최신 날짜(date) 우선.

출력은 "sorted" 배열로만. 각 원소는 원본 idx 그대로 유지.
{ "sorted": [ { "idx": number, "relevanceScore": number } ] }

입력:
${JSON.stringify(compact)}
`.trim();

  try {
    const res = await axios.post(
      GPT_API_URL,
      {
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Output ONLY valid JSON object." },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const raw = res?.data?.choices?.[0]?.message?.content || "";
    const parsed = tryParseJsonObject(raw);
    const sorted = Array.isArray(parsed?.sorted) ? parsed.sorted : null;
    if (!sorted) return null;

    // idx 유효한 것만
    const picked = sorted
      .map((x) => ({
        idx: Number(x?.idx),
        relevanceScore: clampInt(x?.relevanceScore, 0, 100, null),
      }))
      .filter((x) => Number.isFinite(x.idx) && x.idx >= 0 && x.idx < news.length);

    if (!picked.length) return null;

    const used = new Set();
    const out = [];

    for (const p of picked) {
      used.add(p.idx);
      const item = { ...news[p.idx] };
      if (p.relevanceScore !== null) item.relevanceScore = p.relevanceScore;
      out.push(item);
    }

    // 빠진 게 있으면 뒤에 이어붙임(안전장치)
    for (let i = 0; i < news.length; i++) {
      if (!used.has(i)) out.push(news[i]);
    }

    return out;
  } catch {
    return null;
  }
};

export const summarizeNewsWithGPT = async (newsData, limit, keyword, category) => {
  const safeLimit = clampInt(limit, 1, 100, 10);
  const input = Array.isArray(newsData) ? newsData.slice(0, safeLimit) : [];

  if (!input.length) return { talking: [], news: [] };

  const chunks = chunkArray(input, 10);

  const mergedNews = [];
  const mergedTalking = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 1차
    let result = await summarizeChunkWithGPT(chunk, keyword, category, i);
    // 2차(1회 재시도)
    if (!result) result = await summarizeChunkWithGPT(chunk, keyword, category, i);

    // 실패하면 raw로 채움(그리고 점수 로컬계산)
    if (!result) {
      mergedNews.push(...chunk.map((x) => fallbackItemFromRaw(x, keyword, category)));
      continue;
    }

    // talking은 청크마다 받아오고, 마지막에 다 합침 ✅
    if (Array.isArray(result.talking)) mergedTalking.push(...result.talking);

    const out = Array.isArray(result.news) ? result.news : [];

    // 부족하면 raw로 채움
    if (out.length < chunk.length) {
      const filled = [...out];
      for (let k = out.length; k < chunk.length; k++) {
        filled.push(fallbackItemFromRaw(chunk[k], keyword, category));
      }
      mergedNews.push(...filled);
    } else {
      mergedNews.push(...out.slice(0, chunk.length));
    }
  }

  // 1) 1차 정렬: relevanceScore 기반(청크 간 전체 정렬) ✅
  let sortedNews = sortNewsByRelevanceThenDate(mergedNews).slice(0, safeLimit);

  // 2) (옵션) GPT로 전체 재정렬 1회 더 ✅
  const reranked = await rerankAllNewsWithGPT(sortedNews, keyword, category);
  if (reranked && Array.isArray(reranked)) {
    sortedNews = reranked.slice(0, safeLimit);
  }

  // 3) talking: 청크 talking 전부 합친 뒤 10개 이내로 정리 ✅
  const refinedTalking = await refineTalkingWithGPT(mergedTalking, keyword, category);

  return {
    talking: Array.isArray(refinedTalking) ? refinedTalking : dedupeStrings(mergedTalking).slice(0, 10),
    news: sortedNews,
  };
};

// ---------------- 3) Final ----------------
export const fetchNews = async (keyword, category, limit) => {
  const rawNews = await fetchNaverNews(keyword, category, limit);
  const summarized = await summarizeNewsWithGPT(rawNews, limit, keyword, category);

  return {
    talking: Array.isArray(summarized?.talking) ? summarized.talking : [],
    news: Array.isArray(summarized?.news) ? summarized.news : [],
  };
};
