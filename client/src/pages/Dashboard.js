import React, { useState, useEffect } from "react";
import { fetchNews } from "../services/newsService";
import { Container, Form, Button, Card, Spinner, Alert, Badge, Row, Col } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css"; // ✅ 추가된 CSS 파일 (별도 생성 필요)

const Dashboard = () => {
  // ✅ `localStorage`에서 데이터 불러오기
  const savedNews = JSON.parse(localStorage.getItem("news")) || [];
  const savedTalking = JSON.parse(localStorage.getItem("talking")) || [];

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("최신 동향");
  const [limit, setLimit] = useState(10);
  const [news, setNews] = useState(savedNews);
  const [talking, setTalking] = useState(savedTalking);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("news", JSON.stringify(news));
    localStorage.setItem("talking", JSON.stringify(talking));
  }, [news, talking]);

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
      alert("기관명을 입력하세요!");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await fetchNews(keyword, category, limit);
      setNews(results.news);
      setTalking(results.talking);
      localStorage.setItem("news", JSON.stringify(results.news));
      localStorage.setItem("talking", JSON.stringify(results.talking));
    } catch (err) {
      setError("뉴스를 가져오는 중 오류가 발생했습니다.");
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <Container className="dashboard-container mt-4">
      <h2 className="text-center title">📢 최신 뉴스 검색</h2>

      {/* 자주 쓰는 키워드 버튼 */}
      <div className="keyword-container mb-3">
        {popularKeywords.map((word) => (
          <Button key={word} variant="outline-dark" className="keyword-btn me-2 mb-2" onClick={() => setKeyword(word)}>
            {word}
          </Button>
        ))}
      </div>

      {/* 검색 폼 */}
      <Card className="search-card p-4 shadow-sm">
        <Form>
          <Row>
            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>📌 기관명</Form.Label>
                <Form.Control type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="기관명을 입력하세요" />
              </Form.Group>
            </Col>

            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>🔍 검색 키워드</Form.Label>
                <Form.Control type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 채용 동향" />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>📅 뉴스 개수</Form.Label>
                <Form.Control type="number" min="1" max="25" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
              </Form.Group>
            </Col>
          </Row>

          <div className="text-center">
            <Button variant="dark" className="search-btn" onClick={handleSearch} disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : "🔍 뉴스 검색"}
            </Button>
          </div>
        </Form>
      </Card>

      {talking.length > 0 && (
        <div className="talking-ideas-card mt-4">
          <h4 className="talking-title">💡 논의할 아이디어</h4>
          <ul className="talking-list">
            {talking.map((idea, index) => (
              <li key={index} className="talking-item">
                <span className="talking-icon">✅</span> {idea}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 오류 메시지 */}
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      {/* 검색 결과 */}
      {news.length > 0 && (
        <Row className="mt-4">
          {news.map((item, index) => (
            <Col md={6} lg={4} key={index} className="mb-4">
              <Card className="news-card shadow-sm" onClick={() => navigate("/detail", { state: item })}>
                <Card.Body>
                  <Card.Title className="news-title">{item.title}</Card.Title>
                  <Card.Text className="news-summary">{item.summary}</Card.Text>
                  <small className="text-muted">{formatDate(item.date)}</small>
                  <div className="mt-2">
                    {item.keywords && item.keywords.map((kw, i) => (
                      <Badge key={i} bg="dark" className="me-1">{kw}</Badge>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  );
};

export default Dashboard;
