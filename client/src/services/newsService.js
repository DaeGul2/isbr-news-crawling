// client/src/services/newsService.js
import axios from "axios";

// ✅ 서버 주소를 .env로 분리
// - CRA proxy 쓰면: REACT_APP_API_BASE_URL="" (또는 미설정) + package.json에 "proxy": "http://localhost:5000"
// - proxy 안 쓰면: REACT_APP_API_BASE_URL="http://localhost:5000"
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

// ✅ 최종: 서버가 다 처리 (naver + gpt + 관련도정렬 + talking)
// password는 서버 SECRET_PASSWORD와 비교용
export const fetchNews = async (keyword, category, limit, password) => {
  const safeLimit = clampInt(limit, 1, 100, 10);
  const kw = String(keyword || "").trim();
  const cat = String(category || "").trim();
  const pw = String(password || "").trim();

  const url = `${API_BASE_URL}/api/newsletter`;

  const res = await axios.get(url, {
    params: { keyword: kw, category: cat, limit: safeLimit, password: pw },
  });

  // { talking: string[], news: [...] }
  return res?.data || { talking: [], news: [] };
};
