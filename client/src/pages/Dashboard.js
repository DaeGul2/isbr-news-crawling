import React, { useState } from "react";
import { fetchNews } from "../services/newsService";
import { Container, Form, Button, ListGroup, Spinner, Alert, Badge } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("최신 동향");
  const [date, setDate] = useState("");
  const [limit, setLimit] = useState(10);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // 자주 쓰는 키워드 리스트
  const popularKeywords = ["한국해외인프라도시개발지원공사(kind)", "KIAT 한국산업기술진흥원", "마사회", "건설근로자공제회"];

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

  // 뉴스 검색
  const handleSearch = async () => {
    if (!keyword) {
      alert("키워드를 입력하세요!");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await fetchNews(keyword, category, date, limit);
      setNews(results);
    } catch (err) {
      setError("뉴스를 가져오는 중 오류가 발생했습니다.");
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <Container className="mt-4">
      <h2>뉴스 검색</h2>

      {/* 자주 쓰는 키워드 버튼 */}
      <div className="mb-3">
        {popularKeywords.map((word) => (
          <Button key={word} variant="outline-primary" className="me-2 mb-2" onClick={() => setKeyword(word)}>
            {word}
          </Button>
        ))}
      </div>

      {/* 검색 폼 */}
      <Form>
        <Form.Group className="mb-3">
          <Form.Label>키워드</Form.Label>
          <Form.Control type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>카테고리</Form.Label>
          <Form.Control type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>날짜 기준</Form.Label>
          <Form.Control type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>가져올 뉴스 개수</Form.Label>
          <Form.Control type="number" min="1" max="20" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
        </Form.Group>

        <Button variant="primary" onClick={handleSearch} disabled={loading}>
          {loading ? <Spinner animation="border" size="sm" /> : "해당 정보로 뉴스 검색"}
        </Button>
      </Form>

      {/* 오류 메시지 */}
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      {/* 검색 결과 */}
      {news.length > 0 && (
        <ListGroup className="mt-4">
          {news.map((item, index) => (
            <ListGroup.Item key={index} action onClick={() => navigate("/detail", { state: item })}>
              <strong>{item.title}</strong>
              <br />
              <small className="text-muted">{item.source} | {formatDate(item.date)}</small>
              <div className="mt-2">
                {item.keywords && item.keywords.map((kw, i) => (
                  <Badge key={i} bg="secondary" className="me-1">{kw}</Badge>
                ))}
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </Container>
  );
};

export default Dashboard;
