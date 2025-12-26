require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------- ENV ----------------
const NAVER_API_URL = "https://openapi.naver.com/v1/search/news.json";
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

// ✅ 추가: 서버 접근 비밀번호
const SECRET_PASSWORD = process.env.SECRET_PASSWORD;

// ---------------- utils ----------------
const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

const parseDateTs = (dateStr) => {
  const t = Date.parse(dateStr || "");
  return Number.isFinite(t) ? t : 0;
};

const tokenize = (s) =>
  String(s || "")
    .toLowerCase()
    .split(/[\s/|,]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

const heuristicRelevanceScore = (item, keyword, category) => {
  const title = String(item?.title || "").toLowerCase();
  const summary = String(item?.summary || "").toLowerCase();

  const keys = Array.from(
    new Set([
      ...tokenize(keyword),
      ...tokenize(category),
      String(keyword || "").toLowerCase(),
      String(category || "").toLowerCase(),
    ])
  ).filter(Boolean);

  if (!keys.length) return 50;

  let score = 10;
  for (const k of keys) {
    if (!k) continue;
    if (title.includes(k)) score += 18;
    if (summary.includes(k)) score += 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
};

const fallbackItemFromRaw = (raw, keyword, category) => {
  const title = safeSlice(stripHtml(raw?.title), 120);
  const summary =
    safeSlice(stripHtml(raw?.summary || ""), 260) ||
    safeSlice(stripHtml(raw?.title), 260);

  const base = {
    title,
    summary,
    source: raw?.source || "",
    date: raw?.pubDate || raw?.date || "",
    keywords: [],
  };

  return {
    ...base,
    relevanceScore: heuristicRelevanceScore(base, keyword, category),
  };
};

// ---------------- NAVER fetch ----------------
async function fetchNaverNews(query, display, sort) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 누락");
  }

  const resp = await axios.get(NAVER_API_URL, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
    params: { query, display, sort },
    timeout: 15000,
  });

  const items = Array.isArray(resp?.data?.items) ? resp.data.items : [];
  return items.map((item) => ({
    title: stripHtml(item.title),
    summary: stripHtml(item.description),
    source: item.link,
    pubDate: item.pubDate,
  }));
}

// ---------------- OpenAI chunk summarize ----------------
async function summarizeChunkWithGPT(chunk, keyword, category, chunkIndex) {
  if (!Array.isArray(chunk) || chunk.length === 0) {
    return { talking: [], news: [] };
  }

  if (!OPENAI_API_KEY) {
    return {
      talking: [],
      news: chunk.map((x) => fallbackItemFromRaw(x, keyword, category)),
    };
  }

  const compact = chunk.map((n, i) => ({
    id: chunkIndex * 10 + i + 1,
    title: safeSlice(stripHtml(n?.title), 140),
    summary: safeSlice(stripHtml(n?.summary), 320),
    source: n?.source || "",
    pubDate: n?.pubDate || "",
  }));

  const size = compact.length;

  const prompt = `
너는 "오직 JSON"만 출력한다. 설명/마크다운/텍스트 금지.

[분류 기준]
- keyword: "${String(keyword || "").trim()}"
- category(중점 키워드): "${String(category || "").trim()}"

[관련도 점수 규칙] relevanceScore: 0~100
- 90~100: category와 직접적으로 동일 주제(핵심 내용이 category에 해당)
- 70~89: 강하게 연관(동의어/유사주제/직접 영향)
- 40~69: 간접 연관(배경/맥락/부분 언급)
- 0~39: 거의 무관

[요구사항]
- 아래 뉴스 ${size}개를 한국어로 요약.
- news 배열 길이는 반드시 ${size}.
- 입력 순서 유지.
- source/date는 입력 그대로 유지.
- keywords는 3~6개.
- 각 뉴스에 relevanceScore 포함.

[출력 스키마(반드시 준수)]
{
  "talking": string[],
  "news": [
    { "title": string, "summary": string, "source": string, "date": string, "keywords": string[], "relevanceScore": number }
  ]
}

[입력 뉴스]
${JSON.stringify(compact)}
`.trim();

  const resp = await axios.post(
    OPENAI_CHAT_URL,
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
      timeout: 60000,
    }
  );

  const content = resp?.data?.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // json_object인데도 가끔 장난치면 fallback
    return {
      talking: [],
      news: chunk.map((x) => fallbackItemFromRaw(x, keyword, category)),
    };
  }

  const talking = Array.isArray(parsed?.talking) ? parsed.talking : [];
  const outNews = Array.isArray(parsed?.news) ? parsed.news : [];

  // 길이/필드 보정 (부족하면 raw로 채움)
  const normalized = [];
  for (let i = 0; i < chunk.length; i++) {
    const raw = chunk[i];
    const x = outNews[i];

    if (!x) {
      normalized.push(fallbackItemFromRaw(raw, keyword, category));
      continue;
    }

    const item = {
      title: safeSlice(stripHtml(x?.title ?? raw?.title), 120),
      summary: safeSlice(stripHtml(x?.summary ?? raw?.summary), 260),
      source: x?.source || raw?.source || "",
      date: x?.date || raw?.pubDate || "",
      keywords: Array.isArray(x?.keywords)
        ? x.keywords.map(stripHtml).filter(Boolean).slice(0, 6)
        : [],
      relevanceScore: clampInt(
        x?.relevanceScore,
        0,
        100,
        heuristicRelevanceScore(x, keyword, category)
      ),
    };

    // 최후의 안전장치
    if (!Number.isFinite(Number(item.relevanceScore))) {
      item.relevanceScore = heuristicRelevanceScore(item, keyword, category);
    }

    normalized.push(item);
  }

  return {
    talking: talking.map(stripHtml).filter(Boolean),
    news: normalized,
  };
}

async function summarizeAll(rawNews, limit, keyword, category) {
  const safeLimit = clampInt(limit, 1, 100, 10);
  const input = Array.isArray(rawNews) ? rawNews.slice(0, safeLimit) : [];
  if (!input.length) return { talking: [], news: [] };

  const chunks = chunkArray(input, 10);

  const mergedNews = [];
  const mergedTalking = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 1차
    let result = await summarizeChunkWithGPT(chunk, keyword, category, i);
    // 2차(한 번 더)
    if (!result) result = await summarizeChunkWithGPT(chunk, keyword, category, i);

    if (!result) {
      mergedNews.push(
        ...chunk.map((x) => fallbackItemFromRaw(x, keyword, category))
      );
      continue;
    }

    mergedNews.push(...(Array.isArray(result.news) ? result.news : []));
    if (Array.isArray(result.talking)) mergedTalking.push(...result.talking);
  }

  // 관련도 높은 순 + 최신 순 정렬
  const sorted = mergedNews
    .map((x) => ({
      ...x,
      relevanceScore: clampInt(
        x?.relevanceScore,
        0,
        100,
        heuristicRelevanceScore(x, keyword, category)
      ),
    }))
    .sort((a, b) => {
      const ds = (b.relevanceScore || 0) - (a.relevanceScore || 0);
      if (ds !== 0) return ds;
      return parseDateTs(b.date) - parseDateTs(a.date);
    })
    .slice(0, safeLimit);

  return {
    talking: dedupeStrings(mergedTalking).slice(0, 10),
    news: sorted,
  };
}

// ---------------- routes ----------------
app.get("/health", (req, res) => res.json({ ok: true }));

// 기존: 네이버 뉴스 프록시(원본)
app.get("/api/news", async (req, res) => {
  let { query, display, sort } = req.query;

  display = clampInt(display, 1, 100, 10);
  sort = String(sort || "date");

  try {
    const processedNews = await fetchNaverNews(
      String(query || "").trim(),
      display,
      sort
    );
    res.json(processedNews);
  } catch (error) {
    console.error("네이버 뉴스 API 요청 실패:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json({ error: "네이버 뉴스 API 요청 실패" });
  }
});

// ✅ 신규: GPT 요약/키워드/관련도/정렬까지 서버에서 처리 + 비밀번호 인증
app.get("/api/newsletter", async (req, res) => {
  const keyword = String(req.query.keyword || "").trim();
  const category = String(req.query.category || "").trim();
  const limit = clampInt(req.query.limit, 1, 100, 10);

  // ✅ 추가: password 인증
  const password = String(req.query.password || "").trim();

  if (!SECRET_PASSWORD) {
    return res
      .status(500)
      .json({ error: "서버 설정 오류: SECRET_PASSWORD가 없습니다." });
  }
  if (!password || password !== SECRET_PASSWORD) {
    return res
      .status(401)
      .json({ error: "인증 실패: 비밀번호가 올바르지 않습니다." });
  }

  if (!keyword) {
    return res.status(400).json({ error: "keyword는 필수입니다." });
  }

  try {
    const raw = await fetchNaverNews(keyword, limit, "date");
    const result = await summarizeAll(raw, limit, keyword, category);

    res.json(result);
  } catch (e) {
    console.error("뉴스레터 생성 실패:", e.response?.data || e.message);
    res.status(500).json({ error: "뉴스레터 생성 실패" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
});
