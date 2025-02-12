require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const NAVER_API_URL = "https://openapi.naver.com/v1/search/news.json";
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const SECRET_PASSWORD = process.env.SECRET_PASSWORD;

// 네이버 뉴스 API 프록시 엔드포인트
app.get("/api/news", async (req, res) => {
  let { query, display, sort } = req.query;
  console.log("server쪽 display : ", display);
  
  if (isNaN(display) || display < 1 || display > 100) {
    display = 10;
  }
  
  try {
    const response = await axios.get(NAVER_API_URL, {
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
      },
      params: { query, display, sort },
    });

    // 받은 데이터를 클라이언트가 쉽게 처리할 수 있도록 변환
    const processedNews = response.data.items.map((item) => ({
      title: item.title.replace(/<\/?b>/g, ""), // <b> 태그 제거
      summary: item.description.replace(/<\/?b>/g, ""),
      source: item.link,
      pubDate: item.pubDate,
    }));

    res.json(processedNews);
  } catch (error) {
    console.error("네이버 뉴스 API 요청 실패:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: "네이버 뉴스 API 요청 실패" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
});
