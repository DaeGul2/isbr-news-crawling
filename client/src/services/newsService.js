import axios from "axios";

const GPT_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

/**
 * 1️⃣ 네이버 뉴스 API에서 최신 뉴스 가져오기
 */
export const fetchNaverNews = async (keyword, category, limit) => {


  if (isNaN(limit) || limit < 1 || limit > 100) {
    limit = 10;
  }


  try {
    const response = await axios.get("http://localhost:5000/api/news", {
      params: { query: keyword, display: limit, sort: "date" },
    });

    return response.data; // 이미 서버에서 가공된 데이터
  } catch (error) {
    console.error("네이버 뉴스 가져오기 실패:", error);
    return [];
  }
};

/**
 * 2️⃣ GPT-4o를 사용하여 뉴스 요약 생성
 */
export const summarizeNewsWithGPT = async (newsData,limit, keyword, category) => {
  if (!newsData.length) return [];

  try {
    const prompt = `
    안녕 나는 공공기관 채용담당자야.
      다음은 '${keyword}' 기관에 대한 최신 뉴스 리스트야. '${keyword}'기관은 현재 내 클라이언트 기관이야.
      '카테고리 (${category})'와 내 기관에 관련된 뉴스 위주로 요약해줘.  
단, **최소 ${limit}개의 뉴스를 포함해야 하며, 관련 뉴스가 부족하더라도 개수를 맞춰서 제공해야 해.**  
출처 없는 뉴스는 제외하고, JSON 형식으로 제공해줘.
      
      
      그리고 각 뉴스의 키워드들을 5개 이내로 작성해줘.
      그리고, 각 뉴스들을 종합적으로 파악해서, 해당 기관의 채용 담당자들과 논의해보면 좋을만한 아이디어들을 5개 이내로 만들어줘. 단, 아이디어는 구체적이고 발전가능성이 있게.

      뉴스 데이터:
      ${newsData
        .map(
          (news, index) => `[${index + 1}] 제목: ${news.title}\n설명: ${news.summary}\n출처: ${news.source}\n날짜: ${news.pubDate}`
        )
        .join("\n\n")}

      📌 JSON 형식:
       {
        "talking": ["아래 뉴스 전체들의 주제들을 통해, 해당 기관의 채용담당자와 상의해보면 좋을 아이디어들"],
        "news": [
          {
            "title": "뉴스 제목",
            "summary": "요약된 내용",
            "source": "뉴스 출처 URL",
            "date": "발행 날짜",
            "keywords": ["키워드1", "키워드2"]
          }
        ]
      }
    `;

    console.log("prompot : ", prompt);

    const response = await axios.post(
      GPT_API_URL,
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 5000,
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    let data = response.data.choices[0].message.content;
    // ✅ GPT 응답에서 ```json ~ ``` 마크다운 제거
    data = data.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(data);
    // console.log("gpt 응답 : ",parsedData);

    // ✅ 기본 구조 유지 (talking & news 배열이 없을 경우 기본값 제공)
    return {
      talking: parsedData.talking || [],  // ✅ 배열 형식 유지
      news: parsedData.news || [],
    };
  } catch (error) {
    console.error("GPT 요약 실패:", error);

  }
};

/**
 * 3️⃣ 최종 뉴스 검색 + GPT 요약
 */
export const fetchNews = async (keyword, category, limit) => {
  const rawNews = await fetchNaverNews(keyword, "", limit);
  const summarizedNews = await summarizeNewsWithGPT(rawNews,limit, keyword, category);
  return summarizedNews;
};
