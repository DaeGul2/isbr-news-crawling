// client/src/pages/Dashboard.js
import React, { useState, useEffect } from "react";
import { fetchNews } from "../services/newsService";
import {
  Container,
  Form,
  Button,
  Card,
  Spinner,
  Alert,
  Badge,
  Row,
  Col,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./Dashboard.css";

const Dashboard = () => {
  const savedNews = JSON.parse(localStorage.getItem("news")) || [];
  const savedTalking = JSON.parse(localStorage.getItem("talking")) || [];
  const savedPassword = localStorage.getItem("newsletterPassword") || "";

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("최신 동향");
  const [limit, setLimit] = useState(10);
  const [password, setPassword] = useState(savedPassword);

  const [news, setNews] = useState(savedNews);
  const [talking, setTalking] = useState(savedTalking);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [lastSearchMeta, setLastSearchMeta] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("lastSearchMeta")) || null;
    } catch {
      return null;
    }
  });

  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("news", JSON.stringify(news));
    localStorage.setItem("talking", JSON.stringify(talking));
  }, [news, talking]);

  useEffect(() => {
    localStorage.setItem("lastSearchMeta", JSON.stringify(lastSearchMeta));
  }, [lastSearchMeta]);

  useEffect(() => {
    localStorage.setItem("newsletterPassword", password || "");
  }, [password]);

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

  const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "").trim();

  const safeFilePart = (s) =>
    String(s || "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);

  const formatKstForFilename = (d = new Date()) => {
    const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const yyyy = kst.getFullYear();
    const mm = String(kst.getMonth() + 1).padStart(2, "0");
    const dd = String(kst.getDate()).padStart(2, "0");
    const hh = String(kst.getHours()).padStart(2, "0");
    const mi = String(kst.getMinutes()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${mi}`;
  };

  const safeScore = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  const scoreBadgeBg = (score) => {
    if (score >= 80) return "success";
    if (score >= 50) return "primary";
    if (score >= 30) return "warning";
    return "secondary";
  };

  // ✅ 엑셀 다운로드 (관련도 포함 + 중복 컬럼 제거 + talking 시트 추가)
  const handleDownloadExcel = () => {
    if (!news || news.length === 0) {
      alert("다운로드할 뉴스가 없습니다. 먼저 검색하세요.");
      return;
    }

    const meta = lastSearchMeta || {
      keyword,
      category,
      limit,
      fetchedAt: new Date().toISOString(),
    };

    // 1) 메타 시트
    const metaRows = [
      { 항목: "뉴스 키워드", 값: meta.keyword ?? "" },
      { 항목: "중점 키워드", 값: meta.category ?? "" },
      { 항목: "요청 뉴스 개수", 값: meta.limit ?? "" },
      { 항목: "가져온 시각(ISO)", 값: meta.fetchedAt ?? "" },
      { 항목: "가져온 시각(KST)", 값: formatDate(meta.fetchedAt) },
      { 항목: "결과 뉴스 개수", 값: news.length },
    ];

    // 2) 뉴스목록 시트 (제목/요약은 텍스트만)
    const newsRows = news.map((item, idx) => {
      const keywordsArr = Array.isArray(item?.keywords)
        ? item.keywords
        : item?.keywords
        ? [String(item.keywords)]
        : [];

      return {
        번호: idx + 1,
        관련도점수: safeScore(item?.relevanceScore),
        작성일: formatDate(item?.date),
        제목: stripHtml(item?.title ?? ""),
        요약: stripHtml(item?.summary ?? ""),
        키워드: keywordsArr.join(", "),
        출처: item?.source ?? "",
      };
    });

    // 3) 뉴스레터 추천 주제 시트 (talking)
    const talkingRows =
      Array.isArray(talking) && talking.length
        ? talking.map((t, i) => ({
            번호: i + 1,
            추천주제: String(t || "").trim(),
          }))
        : [{ 번호: 1, 추천주제: "(추천 주제가 없습니다)" }];

    const wb = XLSX.utils.book_new();

    const wsMeta = XLSX.utils.json_to_sheet(metaRows);
    wsMeta["!cols"] = [{ wch: 18 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, "메타정보");

    const wsNews = XLSX.utils.json_to_sheet(newsRows);
    wsNews["!cols"] = [
      { wch: 6 }, // 번호
      { wch: 10 }, // 관련도점수
      { wch: 22 }, // 작성일
      { wch: 50 }, // 제목
      { wch: 70 }, // 요약
      { wch: 40 }, // 키워드
      { wch: 50 }, // 출처
    ];
    XLSX.utils.book_append_sheet(wb, wsNews, "뉴스목록");

    const wsTalking = XLSX.utils.json_to_sheet(talkingRows);
    wsTalking["!cols"] = [{ wch: 6 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsTalking, "뉴스레터 추천 주제");

    const filename = `뉴스_${safeFilePart(meta.keyword)}_${formatKstForFilename(
      new Date()
    )}.xlsx`;

    XLSX.writeFile(wb, filename, { compression: true });
  };

  // ✅ 뉴스 검색
  const handleSearch = async () => {
    if (!keyword) {
      alert("뉴스 키워드을 입력하세요!");
      return;
    }
    if (!password) {
      alert("비밀번호를 입력하세요!");
      return;
    }

    setLoading(true);
    setError(null);

    // ✅ 분석 끝나기 전엔 화면 비우기(착시 방지)
    setNews([]);
    setTalking([]);

    try {
      const results = await fetchNews(keyword, category, limit, password);

      setNews(results.news || []);
      setTalking(results.talking || []);

      const meta = {
        keyword,
        category,
        limit,
        fetchedAt: new Date().toISOString(),
      };
      setLastSearchMeta(meta);

      localStorage.setItem("news", JSON.stringify(results.news || []));
      localStorage.setItem("talking", JSON.stringify(results.talking || []));
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "뉴스를 가져오는 중 오류가 발생했습니다.";

      if (status === 401) {
        setError(`인증 실패: 비밀번호가 올바르지 않습니다.`);
      } else {
        setError(msg);
      }
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <Container className="dashboard-container mt-4">
      <h2 className="text-center title">📢 최신 뉴스 검색</h2>

      {/* 검색 폼 */}
      <Card className="search-card p-4 shadow-sm">
        <Form>
          <Row>
            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>📌 뉴스 키워드</Form.Label>
                <Form.Control
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="뉴스 키워드을 입력하세요"
                />
              </Form.Group>
            </Col>

            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>🔍 뉴스 내에서 중점으로 볼 키워드</Form.Label>
                <Form.Control
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="예: 채용 동향"
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>📅 뉴스 개수</Form.Label>
                <Form.Control
                  type="number"
                  min="1"
                  max="25"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </Form.Group>
            </Col>

            <Col md={6} className="mb-3">
              <Form.Group>
                <Form.Label>🔒 비밀번호</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="서버 접근 비밀번호"
                />
                <Form.Text className="text-muted">
                  서버의 SECRET_PASSWORD와 일치해야 뉴스레터 생성이 진행됩니다.
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <div className="text-center d-flex justify-content-center gap-2">
            <Button
              variant="dark"
              className="search-btn"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? <Spinner animation="border" size="sm" /> : "🔍 뉴스 검색"}
            </Button>

            <Button
              variant="outline-success"
              className="search-btn"
              onClick={handleDownloadExcel}
              disabled={loading || !news || news.length === 0}
              title="현재 화면의 뉴스 데이터를 엑셀로 다운로드"
            >
              📥 엑셀 다운로드
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
      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}

      {/* 검색 결과 */}
      {news.length > 0 && (
        <Row className="mt-4">
          {news.map((item, index) => {
            const score = safeScore(item?.relevanceScore);

            return (
              <Col md={6} lg={4} key={index} className="mb-4">
                <Card
                  className="news-card shadow-sm"
                  onClick={() => navigate("/detail", { state: item })}
                >
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <Badge bg={scoreBadgeBg(score)}>관련도 {score}</Badge>
                      <small className="text-muted">
                        {formatDate(item?.date)}
                      </small>
                    </div>

                    <Card.Title className="news-title">
                      {item?.title}
                    </Card.Title>
                    <Card.Text className="news-summary">
                      {item?.summary}
                    </Card.Text>

                    <div className="mt-2">
                      {Array.isArray(item?.keywords) &&
                        item.keywords.map((kw, i) => (
                          <Badge key={i} bg="dark" className="me-1">
                            {kw}
                          </Badge>
                        ))}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </Container>
  );
};

export default Dashboard;
