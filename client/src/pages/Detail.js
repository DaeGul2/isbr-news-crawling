import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Container, Button, Badge } from "react-bootstrap";

const Detail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const newsItem = location.state;

  if (!newsItem) {
    return (
      <Container className="mt-4">
        <h2>잘못된 접근입니다.</h2>
        <Button variant="primary" onClick={() => navigate("/")}>
          메인으로 가기
        </Button>
      </Container>
    );
  }

  // 한국 시간(KST) 기준으로 날짜 변환 함수
  const formatDate = (dateString) => {
    if (!dateString) return "날짜 없음";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Seoul",
    }).format(date);
  };

  return (
    <Container className="mt-4">
      <h2>{newsItem.title}</h2>
      <p className="mt-3">{newsItem.summary}</p>
      <p>
        <strong>출처:</strong>{" "}
        <a href={newsItem.source} target="_blank" rel="noopener noreferrer">
          {newsItem.source}
        </a>
      </p>
      <p><strong>발행 날짜:</strong> {formatDate(newsItem.date)}</p>

      {/* ✅ 키워드 태그 표시 */}
      {newsItem.keywords && newsItem.keywords.length > 0 && (
        <div className="mt-3">
          <strong>연관 키워드:</strong>
          <div className="mt-2">
            {newsItem.keywords.map((kw, i) => (
              <Badge key={i} bg="primary" className="me-1">{kw}</Badge>
            ))}
          </div>
        </div>
      )}

      <Button variant="secondary" onClick={() => navigate(-1)} className="mt-3">
        뒤로 가기
      </Button>
    </Container>
  );
};

export default Detail;
